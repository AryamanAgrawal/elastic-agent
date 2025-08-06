#!/usr/bin/env node

import { ElasticClient } from './elastic-client';
import { loadConfig } from './config';

/**
 * Example script showing how to use the Elasticsearch codebase database
 */
async function exampleUsage() {
  try {
    // Load configuration
    const config = loadConfig();
    
    // Create client
    const client = new ElasticClient(
      config.elasticsearchUrl,
      config.elasticsearchUsername,
      config.elasticsearchPassword
    );

    console.log('🔍 Example: Elasticsearch Codebase Database Usage\n');

    // 1. Check if index exists
    console.log('1. Checking if codebase index exists...');
    const exists = await client.indexExists('codebase-store');
    console.log(`   Index exists: ${exists}\n`);

    if (!exists) {
      console.log('   Creating index...');
      await client.createCodebaseIndex();
      console.log('   ✅ Index created!\n');
    }

    // 2. Index some example codebase documents
    console.log('2. Indexing example codebase documents...');
    
    const exampleDocuments = [
      {
        id: 'auth-service',
        document: {
          name: 'AuthService.ts',
          content: `export class AuthService {
  private jwtSecret: string;
  
  constructor() {
    this.jwtSecret = process.env.JWT_SECRET || 'default-secret';
  }
  
  async authenticate(email: string, password: string): Promise<string> {
    const user = await this.userRepository.findByEmail(email);
    if (!user || !await this.verifyPassword(password, user.passwordHash)) {
      throw new Error('Invalid credentials');
    }
    return this.generateToken(user.id);
  }
  
  private async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }
  
  private generateToken(userId: string): string {
    return jwt.sign({ userId }, this.jwtSecret, { expiresIn: '24h' });
  }
}`,
          repository: 'my-webapp',
          file_path: 'src/services/AuthService.ts',
          extension: 'ts',
          element_type: 'class',
          element_id: 'AuthService',
          metadata: {
            methods: ['authenticate', 'verifyPassword', 'generateToken'],
            dependencies: ['bcrypt', 'jwt', 'UserRepository'],
            env_vars: ['JWT_SECRET']
          },
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
      },
      {
        id: 'user-controller',
        document: {
          name: 'UserController.ts',
          content: `@Controller('/api/users')
export class UserController {
  constructor(private userService: UserService) {}
  
  @Get('/:id')
  async getUser(@Param('id') id: string): Promise<UserDto> {
    const user = await this.userService.findById(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return this.mapToDto(user);
  }
  
  @Post('/')
  async createUser(@Body() createUserDto: CreateUserDto): Promise<UserDto> {
    const user = await this.userService.create(createUserDto);
    return this.mapToDto(user);
  }
  
  private mapToDto(user: User): UserDto {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      createdAt: user.createdAt
    };
  }
}`,
          repository: 'my-webapp',
          file_path: 'src/controllers/UserController.ts',
          extension: 'ts',
          element_type: 'class',
          element_id: 'UserController',
          metadata: {
            decorators: ['Controller', 'Get', 'Post', 'Param', 'Body'],
            methods: ['getUser', 'createUser', 'mapToDto'],
            endpoints: ['/api/users/:id', '/api/users'],
            dependencies: ['UserService']
          },
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
      },
      {
        id: 'database-config',
        document: {
          name: 'database.config.ts',
          content: `export const databaseConfig = {
  type: 'postgres' as const,
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  username: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || 'password',
  database: process.env.DB_NAME || 'myapp',
  entities: [User, Post, Comment],
  synchronize: process.env.NODE_ENV !== 'production',
  logging: process.env.NODE_ENV === 'development',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined
};`,
          repository: 'my-webapp',
          file_path: 'src/config/database.config.ts',
          extension: 'ts',
          element_type: 'configuration',
          element_id: 'database-config',
          metadata: {
            env_vars: ['DB_HOST', 'DB_PORT', 'DB_USERNAME', 'DB_PASSWORD', 'DB_NAME', 'NODE_ENV'],
            entities: ['User', 'Post', 'Comment'],
            database_type: 'postgres'
          },
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
      }
    ];

    const bulkResult = await client.bulkIndexDocuments(exampleDocuments);
    console.log(`   ✅ Indexed ${exampleDocuments.length} documents\n`);

    // 3. Search examples
    console.log('3. Searching codebase...\n');

    // Search for authentication-related code
    console.log('   🔍 Searching for "authentication"...');
    const authResults = await client.searchCodebase('authentication', 5);
    console.log(`   Found ${authResults.hits.total.value} results:`);
    authResults.hits.hits.forEach((hit: any, index: number) => {
      console.log(`   ${index + 1}. ${hit._source.name} (${hit._source.file_path})`);
      if (hit.highlight?.content) {
        console.log(`      Preview: ${hit.highlight.content[0].substring(0, 100)}...`);
      }
    });
    console.log();

    // Search for database-related code
    console.log('   🔍 Searching for "database postgres"...');
    const dbResults = await client.searchCodebase('database postgres', 5);
    console.log(`   Found ${dbResults.hits.total.value} results:`);
    dbResults.hits.hits.forEach((hit: any, index: number) => {
      console.log(`   ${index + 1}. ${hit._source.name} (${hit._source.element_type})`);
    });
    console.log();

    // Search for controllers
    console.log('   🔍 Searching for "controller API endpoint"...');
    const controllerResults = await client.searchCodebase('controller API endpoint', 5);
    console.log(`   Found ${controllerResults.hits.total.value} results:`);
    controllerResults.hits.hits.forEach((hit: any, index: number) => {
      console.log(`   ${index + 1}. ${hit._source.name}`);
      if (hit._source.metadata?.endpoints) {
        console.log(`      Endpoints: ${hit._source.metadata.endpoints.join(', ')}`);
      }
    });
    console.log();

    // 4. Advanced search example
    console.log('4. Advanced search - TypeScript files with JWT...');
    const advancedResults = await client.search({
      index: 'codebase-store',
      query: {
        bool: {
          must: [
            { match: { content: 'jwt' } },
            { term: { extension: 'ts' } }
          ]
        }
      },
      size: 5
    });
    
    console.log(`   Found ${advancedResults.hits.total.value} TypeScript files containing JWT:`);
    advancedResults.hits.hits.forEach((hit: any, index: number) => {
      console.log(`   ${index + 1}. ${hit._source.name} (score: ${hit._score.toFixed(2)})`);
    });
    console.log();

    console.log('✅ Example completed successfully!');
    console.log('\n🎯 Next steps:');
    console.log('- Visit http://localhost:5601 to explore data in Kibana');
    console.log('- Modify search queries to find specific code patterns');
    console.log('- Add more documents from your actual codebase');
    console.log('- Integrate embeddings for semantic search');

  } catch (error) {
    console.error('❌ Example failed:', error);
  }
}

if (require.main === module) {
  exampleUsage();
}

export { exampleUsage };