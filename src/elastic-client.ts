import { Client } from '@elastic/elasticsearch';
import { ElasticQuery, ElasticResult } from './types';
import { CODEBASE_INDEX_NAME, CODEBASE_INDEX_CONFIG } from './index-config';

export class ElasticClient {
  private client: Client;

  constructor(url: string, username?: string, password?: string) {
    this.client = new Client({
      node: url,
      auth: username && password ? {
        username,
        password
      } : undefined
    });
  }

  async search(query: ElasticQuery): Promise<ElasticResult> {
    try {
      const response = await this.client.search({
        index: query.index,
        body: {
          query: query.query,
          size: query.size || 10,
          from: query.from || 0
        }
      });

      return response as ElasticResult;
    } catch (error) {
      console.error('Elasticsearch query error:', error);
      throw error;
    }
  }

  async getIndices(): Promise<string[]> {
    try {
      const response = await this.client.cat.indices({
        format: 'json'
      });
      
      return response.map((index: any) => index.index);
    } catch (error) {
      console.error('Error fetching indices:', error);
      throw error;
    }
  }

  async getMapping(index: string): Promise<any> {
    try {
      const response = await this.client.indices.getMapping({
        index
      });
      
      return response;
    } catch (error) {
      console.error(`Error fetching mapping for index ${index}:`, error);
      throw error;
    }
  }

  async indexExists(index: string): Promise<boolean> {
    try {
      const response = await this.client.indices.exists({
        index
      });
      return response;
    } catch (error) {
      console.error(`Error checking if index ${index} exists:`, error);
      return false;
    }
  }

  async createCodebaseIndex(): Promise<void> {
    try {
      const exists = await this.indexExists(CODEBASE_INDEX_NAME);
      
      if (exists) {
        console.log(`Index ${CODEBASE_INDEX_NAME} already exists`);
        return;
      }

      await this.client.indices.create({
        index: CODEBASE_INDEX_NAME,
        ...CODEBASE_INDEX_CONFIG
      });

      console.log(`Successfully created index: ${CODEBASE_INDEX_NAME}`);
    } catch (error) {
      console.error('Error creating codebase index:', error);
      throw error;
    }
  }

  async deleteIndex(index: string): Promise<void> {
    try {
      const exists = await this.indexExists(index);
      
      if (!exists) {
        console.log(`Index ${index} does not exist`);
        return;
      }

      await this.client.indices.delete({
        index
      });

      console.log(`Successfully deleted index: ${index}`);
    } catch (error) {
      console.error(`Error deleting index ${index}:`, error);
      throw error;
    }
  }

  async indexDocument(document: any, id?: string): Promise<any> {
    try {
      const response = await this.client.index({
        index: CODEBASE_INDEX_NAME,
        id,
        body: document
      });

      return response;
    } catch (error) {
      console.error('Error indexing document:', error);
      throw error;
    }
  }

  async bulkIndexDocuments(documents: Array<{ id?: string; document: any }>): Promise<any> {
    try {
      const body = documents.flatMap(({ id, document }) => [
        { index: { _index: CODEBASE_INDEX_NAME, _id: id } },
        document
      ]);

      const response = await this.client.bulk({
        body
      });

      return response;
    } catch (error) {
      console.error('Error bulk indexing documents:', error);
      throw error;
    }
  }

  async searchCodebase(query: string, size: number = 10): Promise<any> {
    try {
      const response = await this.client.search({
        index: CODEBASE_INDEX_NAME,
        body: {
          query: {
            multi_match: {
              query,
              fields: ['name^2', 'content', 'file_path'],
              type: 'best_fields',
              fuzziness: 'AUTO'
            }
          },
          size,
          highlight: {
            fields: {
              content: {},
              name: {}
            }
          }
        }
      });

      return response;
    } catch (error) {
      console.error('Error searching codebase:', error);
      throw error;
    }
  }
}