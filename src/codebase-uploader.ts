import * as fs from 'fs';
import * as path from 'path';
import OpenAI from 'openai';
import { ElasticClient } from './elastic-client';
import { CODEBASE_INDEX_NAME } from './index-config';

export interface CodebaseDocument {
  name: string;
  content: string;
  repository: string;
  file_path: string;
  extension: string;
  element_type: string;
  element_id: string;
  metadata: {
    size_bytes: number;
    line_count: number;
    functions?: string[];
    classes?: string[];
    imports?: string[];
    exports?: string[];
    dependencies?: string[];
    language?: string;
    complexity_score?: number;
  };
  vector?: number[];
  created_at: string;
  updated_at: string;
}

export interface UploadOptions {
  generateEmbeddings?: boolean;
  batchSize?: number;
  includePatterns?: string[];
  excludePatterns?: string[];
  maxFileSize?: number;
  repositoryName?: string;
}

export class CodebaseUploader {
  private elasticClient: ElasticClient;
  private openai?: OpenAI;
  
  // Default patterns to exclude
  private defaultExcludePatterns = [
    'node_modules/**',
    '.git/**',
    'dist/**',
    'build/**',
    '*.min.js',
    '*.min.css',
    '*.map',
    '.env*',
    '*.log',
    '*.tmp',
    '*.lock',
    '*.DS_Store',
    'coverage/**',
    '.nyc_output/**',
    '*.pdf',
    '*.jpg',
    '*.jpeg',
    '*.png',
    '*.gif',
    '*.ico',
    '*.svg',
    '*.mp4',
    '*.mp3',
    '*.wav',
    '*.zip',
    '*.tar.gz',
    '*.exe',
    '*.dll'
  ];

  // Supported text file extensions
  private supportedExtensions = new Set([
    '.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.cs', '.cpp', '.c', '.h',
    '.php', '.rb', '.go', '.rs', '.swift', '.kt', '.scala', '.clj', '.sh',
    '.html', '.css', '.scss', '.sass', '.less', '.vue', '.svelte',
    '.json', '.xml', '.yaml', '.yml', '.toml', '.ini', '.cfg', '.conf',
    '.md', '.mdx', '.txt', '.sql', '.graphql', '.proto'
  ]);

  constructor(elasticClient: ElasticClient, openaiApiKey?: string) {
    this.elasticClient = elasticClient;
    if (openaiApiKey) {
      this.openai = new OpenAI({ apiKey: openaiApiKey });
    }
  }

  async uploadCodebase(
    codebasePath: string,
    options: UploadOptions = {}
  ): Promise<{ success: boolean; totalFiles: number; indexedFiles: number; errors: string[] }> {
    const {
      generateEmbeddings = false,
      batchSize = 50,
      maxFileSize = 1024 * 1024, // 1MB default
      repositoryName = path.basename(codebasePath),
      includePatterns = [],
      excludePatterns = []
    } = options;

    console.log(`🚀 Starting codebase upload: ${codebasePath}`);
    console.log(`📦 Repository: ${repositoryName}`);
    console.log(`🧠 Generate embeddings: ${generateEmbeddings}`);

    const allExcludePatterns = [...this.defaultExcludePatterns, ...excludePatterns];
    const errors: string[] = [];
    let totalFiles = 0;
    let indexedFiles = 0;

    try {
      // Ensure index exists
      await this.elasticClient.createCodebaseIndex();

      // Walk through the codebase
      const filePaths = this.walkDirectory(codebasePath, includePatterns, allExcludePatterns);
      totalFiles = filePaths.length;

      console.log(`📁 Found ${totalFiles} files to process`);

      // Process files in batches
      for (let i = 0; i < filePaths.length; i += batchSize) {
        const batch = filePaths.slice(i, i + batchSize);
        const documents: Array<{ id?: string; document: CodebaseDocument }> = [];

        for (const filePath of batch) {
          try {
            const stats = fs.statSync(filePath);
            
            // Skip files that are too large
            if (stats.size > maxFileSize) {
              console.log(`⚠️  Skipping large file: ${filePath} (${(stats.size / 1024 / 1024).toFixed(2)}MB)`);
              continue;
            }

            const document = await this.parseFile(filePath, codebasePath, repositoryName, stats);
            
            // Generate embedding if requested
            if (generateEmbeddings && this.openai && document.content.length > 0) {
              try {
                const embedding = await this.generateEmbedding(document.content);
                document.vector = embedding;
              } catch (embeddingError) {
                console.log(`⚠️  Failed to generate embedding for ${filePath}: ${embeddingError}`);
                // Continue without embedding
              }
            }

            documents.push({
              id: this.generateDocumentId(repositoryName, filePath, codebasePath),
              document
            });

          } catch (fileError) {
            const errorMsg = `Failed to process file ${filePath}: ${fileError}`;
            errors.push(errorMsg);
            console.error(`❌ ${errorMsg}`);
          }
        }

        // Bulk index the batch
        if (documents.length > 0) {
          try {
            await this.elasticClient.bulkIndexDocuments(documents);
            indexedFiles += documents.length;
            console.log(`✅ Indexed batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(filePaths.length / batchSize)} (${documents.length} files)`);
          } catch (indexError) {
            const errorMsg = `Failed to index batch starting at file ${i}: ${indexError}`;
            errors.push(errorMsg);
            console.error(`❌ ${errorMsg}`);
          }
        }

        // Small delay to avoid overwhelming the system
        if (i + batchSize < filePaths.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      const successRate = totalFiles > 0 ? ((indexedFiles / totalFiles) * 100).toFixed(1) : '0';
      console.log(`\n🎉 Upload completed!`);
      console.log(`📊 Total files: ${totalFiles}`);
      console.log(`✅ Indexed files: ${indexedFiles}`);
      console.log(`📈 Success rate: ${successRate}%`);
      
      if (errors.length > 0) {
        console.log(`⚠️  Errors: ${errors.length}`);
      }

      return {
        success: errors.length < totalFiles / 2, // Success if less than 50% errors
        totalFiles,
        indexedFiles,
        errors
      };

    } catch (error) {
      console.error('❌ Upload failed:', error);
      return {
        success: false,
        totalFiles,
        indexedFiles,
        errors: [...errors, `Upload failed: ${error}`]
      };
    }
  }

  private walkDirectory(
    dirPath: string,
    includePatterns: string[],
    excludePatterns: string[]
  ): string[] {
    const files: string[] = [];

    const walkDir = (currentPath: string) => {
      try {
        const items = fs.readdirSync(currentPath);

        for (const item of items) {
          const fullPath = path.join(currentPath, item);
          const relativePath = path.relative(dirPath, fullPath);
          const stats = fs.statSync(fullPath);

          // Check exclusion patterns
          if (this.matchesPatterns(relativePath, excludePatterns)) {
            continue;
          }

          if (stats.isDirectory()) {
            walkDir(fullPath);
          } else if (stats.isFile()) {
            // Check inclusion patterns (if specified)
            if (includePatterns.length > 0 && !this.matchesPatterns(relativePath, includePatterns)) {
              continue;
            }

            // Check if it's a supported file type
            const ext = path.extname(fullPath).toLowerCase();
            if (this.supportedExtensions.has(ext) || this.isTextFile(fullPath)) {
              files.push(fullPath);
            }
          }
        }
      } catch (error) {
        console.error(`Error reading directory ${currentPath}:`, error);
      }
    };

    walkDir(dirPath);
    return files;
  }

  private matchesPatterns(filePath: string, patterns: string[]): boolean {
    return patterns.some(pattern => {
      // Simple glob pattern matching
      const regexPattern = pattern
        .replace(/\*\*/g, '.*')
        .replace(/\*/g, '[^/]*')
        .replace(/\?/g, '[^/]');
      
      return new RegExp(`^${regexPattern}$`).test(filePath) ||
             new RegExp(`^${regexPattern}$`).test(filePath.replace(/\\/g, '/'));
    });
  }

  private isTextFile(filePath: string): boolean {
    try {
      const buffer = fs.readFileSync(filePath, { encoding: null });
      
      // Check for null bytes (binary files typically have these)
      for (let i = 0; i < Math.min(buffer.length, 8000); i++) {
        if (buffer[i] === 0) {
          return false;
        }
      }
      
      return true;
    } catch {
      return false;
    }
  }

  private async parseFile(
    filePath: string,
    codebasePath: string,
    repositoryName: string,
    stats: fs.Stats
  ): Promise<CodebaseDocument> {
    const relativePath = path.relative(codebasePath, filePath);
    const extension = path.extname(filePath).toLowerCase();
    const fileName = path.basename(filePath);
    
    let content = '';
    try {
      content = fs.readFileSync(filePath, 'utf-8');
    } catch (error) {
      console.error(`Error reading file ${filePath}:`, error);
      content = '';
    }

    const lineCount = content.split('\n').length;
    const metadata = this.extractMetadata(content, extension);

    return {
      name: fileName,
      content,
      repository: repositoryName,
      file_path: relativePath,
      extension: extension.slice(1), // Remove the dot
      element_type: this.getElementType(extension, content),
      element_id: this.generateElementId(repositoryName, relativePath),
      metadata: {
        size_bytes: stats.size,
        line_count: lineCount,
        language: this.detectLanguage(extension),
        ...metadata
      },
      created_at: stats.birthtime.toISOString(),
      updated_at: stats.mtime.toISOString()
    };
  }

  private extractMetadata(content: string, extension: string): any {
    const metadata: any = {};

    // Extract functions, classes, imports based on language
    if (['.js', '.ts', '.jsx', '.tsx'].includes(extension)) {
      metadata.functions = this.extractJavaScriptFunctions(content);
      metadata.classes = this.extractJavaScriptClasses(content);
      metadata.imports = this.extractJavaScriptImports(content);
      metadata.exports = this.extractJavaScriptExports(content);
    } else if (extension === '.py') {
      metadata.functions = this.extractPythonFunctions(content);
      metadata.classes = this.extractPythonClasses(content);
      metadata.imports = this.extractPythonImports(content);
    } else if (['.java', '.cs'].includes(extension)) {
      metadata.functions = this.extractJavaFunctions(content);
      metadata.classes = this.extractJavaClasses(content);
    }

    // Calculate complexity score (simple heuristic)
    metadata.complexity_score = this.calculateComplexityScore(content);

    return metadata;
  }

  private extractJavaScriptFunctions(content: string): string[] {
    const functions: string[] = [];
    const functionRegex = /(?:function\s+(\w+)|(\w+)\s*:\s*(?:async\s+)?function|(\w+)\s*=\s*(?:async\s+)?\(|(?:async\s+)?(\w+)\s*\()/g;
    
    let match;
    while ((match = functionRegex.exec(content)) !== null) {
      const functionName = match[1] || match[2] || match[3] || match[4];
      if (functionName && !functions.includes(functionName)) {
        functions.push(functionName);
      }
    }
    
    return functions;
  }

  private extractJavaScriptClasses(content: string): string[] {
    const classes: string[] = [];
    const classRegex = /class\s+(\w+)/g;
    
    let match;
    while ((match = classRegex.exec(content)) !== null) {
      classes.push(match[1]);
    }
    
    return classes;
  }

  private extractJavaScriptImports(content: string): string[] {
    const imports: string[] = [];
    const importRegex = /import.*?from\s+['"`]([^'"`]+)['"`]|require\(['"`]([^'"`]+)['"`]\)/g;
    
    let match;
    while ((match = importRegex.exec(content)) !== null) {
      const importPath = match[1] || match[2];
      if (importPath && !imports.includes(importPath)) {
        imports.push(importPath);
      }
    }
    
    return imports;
  }

  private extractJavaScriptExports(content: string): string[] {
    const exports: string[] = [];
    const exportRegex = /export\s+(?:default\s+)?(?:class\s+(\w+)|function\s+(\w+)|const\s+(\w+)|let\s+(\w+)|var\s+(\w+))/g;
    
    let match;
    while ((match = exportRegex.exec(content)) !== null) {
      const exportName = match[1] || match[2] || match[3] || match[4] || match[5];
      if (exportName && !exports.includes(exportName)) {
        exports.push(exportName);
      }
    }
    
    return exports;
  }

  private extractPythonFunctions(content: string): string[] {
    const functions: string[] = [];
    const functionRegex = /def\s+(\w+)\s*\(/g;
    
    let match;
    while ((match = functionRegex.exec(content)) !== null) {
      functions.push(match[1]);
    }
    
    return functions;
  }

  private extractPythonClasses(content: string): string[] {
    const classes: string[] = [];
    const classRegex = /class\s+(\w+)[\s\(]/g;
    
    let match;
    while ((match = classRegex.exec(content)) !== null) {
      classes.push(match[1]);
    }
    
    return classes;
  }

  private extractPythonImports(content: string): string[] {
    const imports: string[] = [];
    const importRegex = /(?:from\s+(\w+)|import\s+(\w+))/g;
    
    let match;
    while ((match = importRegex.exec(content)) !== null) {
      const importName = match[1] || match[2];
      if (importName && !imports.includes(importName)) {
        imports.push(importName);
      }
    }
    
    return imports;
  }

  private extractJavaFunctions(content: string): string[] {
    const functions: string[] = [];
    const functionRegex = /(?:public|private|protected|static)?\s*\w+\s+(\w+)\s*\(/g;
    
    let match;
    while ((match = functionRegex.exec(content)) !== null) {
      functions.push(match[1]);
    }
    
    return functions;
  }

  private extractJavaClasses(content: string): string[] {
    const classes: string[] = [];
    const classRegex = /(?:public|private|protected)?\s*class\s+(\w+)/g;
    
    let match;
    while ((match = classRegex.exec(content)) !== null) {
      classes.push(match[1]);
    }
    
    return classes;
  }

  private calculateComplexityScore(content: string): number {
    // Simple complexity heuristic based on various factors
    let score = 0;
    
    // Control flow statements
    score += (content.match(/\b(if|else|switch|case|for|while|do)\b/g) || []).length;
    
    // Functions/methods
    score += (content.match(/\bfunction\b|def\s+\w+|\w+\s*\(/g) || []).length;
    
    // Nested structures
    score += (content.match(/[{}]/g) || []).length / 10;
    
    // Lines of code (normalized)
    score += content.split('\n').length / 100;
    
    return Math.round(score);
  }

  private getElementType(extension: string, content: string): string {
    if (['.json', '.yaml', '.yml', '.toml', '.ini', '.cfg', '.conf'].includes(extension)) {
      return 'configuration';
    }
    
    if (['.md', '.mdx', '.txt'].includes(extension)) {
      return 'documentation';
    }
    
    if (['.sql'].includes(extension)) {
      return 'database';
    }
    
    if (['.html', '.css', '.scss', '.sass', '.less'].includes(extension)) {
      return 'frontend';
    }
    
    // Check for main class/function patterns
    if (content.includes('class ') || content.includes('class\t')) {
      return 'class';
    }
    
    if (content.includes('function ') || content.includes('def ')) {
      return 'function';
    }
    
    return 'file';
  }

  private detectLanguage(extension: string): string {
    const languageMap: { [key: string]: string } = {
      '.js': 'javascript',
      '.ts': 'typescript',
      '.jsx': 'javascript',
      '.tsx': 'typescript',
      '.py': 'python',
      '.java': 'java',
      '.cs': 'csharp',
      '.cpp': 'cpp',
      '.c': 'c',
      '.h': 'c',
      '.php': 'php',
      '.rb': 'ruby',
      '.go': 'go',
      '.rs': 'rust',
      '.swift': 'swift',
      '.kt': 'kotlin',
      '.scala': 'scala',
      '.clj': 'clojure',
      '.sh': 'bash',
      '.html': 'html',
      '.css': 'css',
      '.scss': 'scss',
      '.sass': 'sass',
      '.less': 'less',
      '.vue': 'vue',
      '.svelte': 'svelte',
      '.sql': 'sql',
      '.md': 'markdown',
      '.json': 'json',
      '.xml': 'xml',
      '.yaml': 'yaml',
      '.yml': 'yaml'
    };
    
    return languageMap[extension] || 'text';
  }

  private generateDocumentId(repositoryName: string, filePath: string, codebasePath: string): string {
    const relativePath = path.relative(codebasePath, filePath);
    return `${repositoryName}::${relativePath.replace(/[/\\]/g, '::')}`;
  }

  private generateElementId(repositoryName: string, relativePath: string): string {
    return `${repositoryName}::${relativePath}`;
  }

  private async generateEmbedding(text: string): Promise<number[]> {
    if (!this.openai) {
      throw new Error('OpenAI client not initialized');
    }

    // Truncate text if too long (OpenAI has token limits)
    const maxLength = 8000;
    const truncatedText = text.length > maxLength ? text.substring(0, maxLength) + '...' : text;

    try {
      const response = await this.openai.embeddings.create({
        model: 'text-embedding-3-small', // More cost-effective than text-embedding-3-large
        input: truncatedText
      });

      return response.data[0].embedding;
    } catch (error) {
      console.error('Error generating embedding:', error);
      throw error;
    }
  }
}