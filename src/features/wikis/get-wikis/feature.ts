import { WebApi } from 'azure-devops-node-api';
import { WikiV2 } from 'azure-devops-node-api/interfaces/WikiInterfaces';
import {
  AzureDevOpsError,
  AzureDevOpsResourceNotFoundError,
} from '../../../shared/errors';
import * as azureDevOpsClient from '../../../clients/azure-devops';
import { WikiClient } from '../../../clients/azure-devops';

type WikiWithContent = WikiV2 & {
  pageContent: any;
  subPagesWithContent: any[];
};

async function getAllSubPagesContent(
  client: WikiClient,
  projectId: string,
  wikiName: string,
  pages: any[],
) {
  let subPagesWithContent: any[] = [];

  subPagesWithContent = await Promise.all(
    pages.map(async (page: any) => {
      if (page.path && wikiName) {
        const pageContent = (
          await client.getPage(projectId, wikiName, page.path)
        ).content;

        if (page.subPages) {
          page.subPages = await getAllSubPagesContent(
            client,
            projectId,
            wikiName,
            page.subPages,
          );
        }

        return { ...page, content: pageContent };
      }
    }),
  );

  return subPagesWithContent;
}
/**
 * Options for getting wikis
 */
export interface GetWikisOptions {
  /**
   * The ID or name of the organization
   * If not provided, the default organization will be used
   */
  organizationId?: string;

  /**
   * The ID or name of the project
   * If not provided, the wikis from all projects will be returned
   */
  projectId?: string;
}

/**
 * Get wikis in a project or organization
 *
 * @param connection The Azure DevOps WebApi connection
 * @param options Options for getting wikis
 * @returns List of wikis
 */
export async function getWikis(
  connection: WebApi,
  options: GetWikisOptions,
): Promise<WikiWithContent[]> {
  try {
    // Get the Wiki API client
    const wikiApi = await connection.getWikiApi();
    // If a projectId is provided, get wikis for that specific project
    // Otherwise, get wikis for the entire organization
    const { projectId, organizationId } = options;

    const client = await azureDevOpsClient.getWikiClient({
      organizationId,
    });

    const wikis = await wikiApi.getAllWikis(projectId);
    let wikisWithContent: WikiWithContent[] = wikis as WikiWithContent[];

    wikisWithContent = await Promise.all(
      wikisWithContent.map(async (wiki) => {
        if (!wiki.name || !projectId) {
          return wiki;
        }

        if (wiki.name && wiki.mappedPath && projectId) {
          try {
            const pageContent = JSON.parse(
              (await client.getPage(projectId, wiki.name, wiki.mappedPath))
                .content,
            );

            wiki.pageContent = pageContent;

            wiki.pageContent['subPages'] = await getAllSubPagesContent(
              client,
              projectId,
              wiki.name,
              wiki.pageContent['subPages'],
            );
          } catch (error) {
            console.error(error);
          }
        }
        return wiki;
      }),
    );

    return wikisWithContent;
  } catch (error) {
    // Handle resource not found errors specifically
    if (
      error instanceof Error &&
      error.message &&
      error.message.includes('The resource cannot be found')
    ) {
      throw new AzureDevOpsResourceNotFoundError(
        `Resource not found: ${options.projectId ? `Project '${options.projectId}'` : 'Organization'}`,
      );
    }

    // If it's already an AzureDevOpsError, rethrow it
    if (error instanceof AzureDevOpsError) {
      throw error;
    }

    // Otherwise, wrap it in a generic error
    throw new AzureDevOpsError(
      `Failed to get wikis: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
