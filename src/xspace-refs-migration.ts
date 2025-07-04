/**
 * Contentful Cross-Space Reference Migration Script
 *
 * This script migrates cross-space references in Contentful from one space/environment
 * to another. It's designed to handle scenarios where content references need to be
 * updated to point to different spaces or environments.
 *
 * The migration process involves three sequential steps:
 * 1. Add new cross-space reference locations to content types
 * 2. Update existing entries to use the new reference locations
 * 3. Remove the old cross-space reference locations from content types
 *
 * ==========================================
 * SETUP INSTRUCTIONS - INSTALL DEPENDENCIES
 * ==========================================
 *
 * Before running this TypeScript script, you need to install the required dependencies.
 * You have two options:
 *
 * OPTION 1: Install dependencies globally (recommended for one-time usage)
 * Run these commands in your terminal:
 *
 *   npm install -g typescript ts-node contentful-migration contentful-management
 *
 * Then run the script with:
 *   npx ts-node xspace-refs-migration.ts
 *
 * OPTION 2: Install dependencies locally in your project
 * First, initialize a package.json if you don't have one:
 *   npm init -y
 *
 * Then install the dependencies:
 *   npm install typescript ts-node contentful-migration contentful-management
 *
 * Then run the script with:
 *   npx ts-node xspace-refs-migration.ts
 *
 * TROUBLESHOOTING:
 * - If you get "command not found" errors, make sure npm is installed and in your PATH
 * - If you get TypeScript compilation errors, ensure you have compatible versions
 *
 * ==========================================
 * LIMITATIONS AND IMPORTANT WARNINGS
 * ==========================================
 *
 * ⚠️  CRITICAL: This script is not thoroughly tested. Please only use this script for
 *     non-production purposes or in environments where you can safely recover from
 *     potential issues.
 *
 * 📝 PUBLISHING BEHAVIOR:
 *    By default, `shouldPublish` is set to 'preserve'. This means:
 *    - Entries that are in "draft" or "changed" status will have their cross-space
 *      references updated in the management API
 *    - However, these changes will NOT be reflected in the Content Delivery API (CDA)
 *      or GraphQL API until the Entry is manually published
 *    - Published entries will remain published after migration
 *
 *    To automatically publish all migrated entries, change the config to:
 *    shouldPublish: true
 *
 *    This will publish all entries that are processed during migration, making
 *    changes immediately visible in the CDA/GraphQL API.
 *
 * 🚨 POTENTIAL GRAPHQL ERRORS:
 *    The third step of this migration removes "old" cross-space reference targets
 *    from Content Types. This might cause the following issues:
 *    - Entries with migrated references that were NOT published may return errors
 *      when resolved through the GraphQL API
 *      - EXAMPLE: `Cannot find the schema for space vm2x9hszn6lx and environment master`
 *    - These errors occur because the GraphQL API cannot resolve references to
 *      removed allowed resource targets
 *    - SOLUTION: Publishing the affected Entry should resolve this error
 *
 * 💡 RECOMMENDATIONS:
 *    - Test this script in a development environment first
 *    - Consider publishing all affected entries after migration if needed
 *    - Monitor your GraphQL API for reference resolution errors
 *    - Have a rollback plan in case of issues
 */

import {
  runMigration,
  MigrationFunction,
  ContentfulEntryResource,
  RunMigrationConfig,
  ITransformEntriesConfig,
} from "contentful-migration";
import { createClient, ContentFields } from "contentful-management";

/**
 * ==========================================
 * MIGRATION CONFIGURATION - EDIT THIS SECTION
 * ==========================================
 *
 * Before running this script, you need to:
 * 1. Set up a Contentful Management API token in your environment variables
 * 2. Update the configuration below for your specific migration needs
 * 3. Run the script using: `npx ts-node xspace-refs-migration.ts`
 *
 * HOW TO GET REQUIRED VALUES:
 *
 * 1. SPACE ID:
 *    - Go to your Contentful space settings
 *    - Copy the "Space ID" from the General tab
 *
 * 2. ACCESS TOKEN:
 *    - Go to Account settings > CMA tokens in your Contentful profile
 *    - Create a new personal access token or use an existing one
 *    - Set it as an environment variable: export CONTENTFUL_ACCESS_TOKEN="your_token_here"
 *    - Or replace process.env.CONTENTFUL_ACCESS_TOKEN! with your token in quotes
 *
 * 3. ENVIRONMENT ID:
 *    - This is the environment where you want to run the migration
 *    - Common values: "master" (production), "dev", "staging"
 *
 * 4. CROSS-SPACE REFERENCE CHANGES:
 *    - These define which references to migrate from one location to another
 *    - "current" = where references currently point
 *    - "new" = where you want references to point after migration
 *
 * EXAMPLE SCENARIOS:
 *
 * Scenario 1: Moving references from master to dev environment (same space)
 * {
 *   current: { spaceId: "abc123", environmentId: "master" },
 *   new: { spaceId: "abc123", environmentId: "dev" }
 * }
 *
 * Scenario 2: Moving references from one space to another
 * {
 *   current: { spaceId: "oldspace123", environmentId: "master" },
 *   new: { spaceId: "newspace456", environmentId: "master" }
 * }
 *
 * Scenario 3: Multiple migrations in one run
 * [
 *   {
 *     current: { spaceId: "space1", environmentId: "master" },
 *     new: { spaceId: "space1", environmentId: "dev" }
 *   },
 *   {
 *     current: { spaceId: "space2", environmentId: "master" },
 *     new: { spaceId: "space2", environmentId: "dev" }
 *   }
 * ]
 */

// Migration configuration - update these values based on your migration requirements
const config: Config = {
  // The Contentful space where you want to run the migration
  spaceId: "e8wddvqxliqi",

  // The environment within that space to migrate
  environmentId: "dev",

  // Your personal access token (keep as environment variable for security)
  accessToken: process.env.CONTENTFUL_ACCESS_TOKEN!,

  // Define which cross-space references should be migrated
  // In this example: migrating from /spaces/vm2x9hszn6lx/environments/master to /spaces/vm2x9hszn6lx/environments/dev
  crossSpaceReferenceTargetChanges: [
    {
      current: { spaceId: "vm2x9hszn6lx", environmentId: "master" },
      new: { spaceId: "vm2x9hszn6lx", environmentId: "dev" },
    },
  ],

  // Whether to publish the entries after migration
  shouldPublish: "preserve",

  // Whether to skip the confirmation prompt during migration
  yes: false,
};

// Global variable to store content types that need migration
// This is populated by the first migration function and used by subsequent ones
let contentTypesToMigrate: ContentTypeResourceLinkFields[] = [];

/**
 * MIGRATION STEP 1: Add new cross-space reference locations to content types
 *
 * This function scans all content types in the target space/environment to find
 * ResourceLink fields that reference cross-space content. It then adds the new
 * reference targets alongside the existing ones, ensuring content can reference
 * both old and new locations during the transition.
 */
const updateContentTypeWithNewXSpaceRefLocations: MigrationFunction = async (
  migration
) => {
  // Create Contentful management client to fetch content type definitions
  const client = createClient(
    {
      accessToken: config.accessToken,
    },
    { type: "plain" }
  );

  // Fetch all content types from the target space/environment
  const contentTypes = await client.contentType.getMany({
    spaceId: config.spaceId,
    environmentId: config.environmentId,
  });

  // Process each content type to identify fields that need cross-space reference updates
  contentTypesToMigrate = contentTypes.items
    .map((contentType) => {
      // Examine each field in the content type
      const fieldsWithXSpaceRefChange = contentType.fields
        .map((field) => {
          // Only process ResourceLink fields that have allowedResources defined
          if (field.type === "ResourceLink" && field.allowedResources) {
            // Check each allowed resource to see if it matches our migration criteria
            const matchedAllowedResources = field.allowedResources
              .map((resource) => {
                if (resource.type === "Contentful:Entry") {
                  const entryResource = resource as ContentfulEntryResource;

                  // Parse the source string to extract space ID and environment
                  // Source format: "crn:contentful:::content:spaces/{spaceId}/environments/{envId}"
                  // or "crn:contentful:::content:spaces/{spaceId}" for master environment
                  const xSpaceRefChange =
                    config.crossSpaceReferenceTargetChanges.find(
                      (change) =>
                        change.current.spaceId ===
                          entryResource.source.split("/")[1] &&
                        (!change.current.environmentId ||
                          change.current.environmentId ===
                            entryResource.source.split("/")[3] ||
                          // Handle master environment (no explicit environment in source)
                          (!entryResource.source.split("/")[3] &&
                            change.current.environmentId === "master"))
                    );

                  // If this resource matches our migration criteria, create the new resource
                  if (xSpaceRefChange) {
                    return {
                      current: entryResource,
                      new: {
                        ...entryResource,
                        // Construct new source string with updated space/environment
                        source: `${entryResource.source.split("/")[0]}/${
                          xSpaceRefChange.new.spaceId
                        }${
                          !xSpaceRefChange.new.environmentId ||
                          xSpaceRefChange.new.environmentId === "master"
                            ? ""
                            : `/environments/${xSpaceRefChange.new.environmentId}`
                        }`,
                      } satisfies ContentfulEntryResource,
                    };
                  }
                }
              })
              .filter(
                (match): match is NonNullable<typeof match> =>
                  match !== undefined
              );

            // If we found matching resources, return field information
            if (matchedAllowedResources.length > 0) {
              return {
                fieldId: field.id,
                matchedAllowedResources,
                originalAllowedResources: field.allowedResources,
              };
            }
          }
        })
        .filter(
          (field): field is NonNullable<typeof field> => field !== undefined
        );

      return {
        contentTypeId: contentType.sys.id,
        fieldsWithXSpaceRefChange,
      };
    })
    // Only keep content types that have fields requiring migration
    .filter(
      ({ fieldsWithXSpaceRefChange }) => fieldsWithXSpaceRefChange.length > 0
    );

  // Ensure we have content types to migrate before proceeding
  if (!contentTypesToMigrate.length) {
    throw new Error(
      "⚠️️ No content types found to migrate. Stopping migration run"
    );
  }

  // Apply the migration changes to each affected content type
  contentTypesToMigrate.forEach(
    ({ contentTypeId, fieldsWithXSpaceRefChange }) => {
      const contentType = migration.editContentType(contentTypeId);

      // Update each field that needs cross-space reference changes
      fieldsWithXSpaceRefChange.forEach(
        ({ fieldId, matchedAllowedResources, originalAllowedResources }) => {
          contentType
            .editField(fieldId)
            // Add both original and new allowed resources (deduplicated)
            // This ensures existing references continue to work while new ones can be created
            .allowedResources(
              deduplicateAllowedResources([
                ...originalAllowedResources,
                ...matchedAllowedResources.map(
                  ({ new: newAllowedResource }) => newAllowedResource
                ),
              ])
            );
        }
      );
    }
  );
};

/**
 * MIGRATION STEP 2: Update existing entry references to use new cross-space locations
 *
 * This function processes all entries of the affected content types and updates
 * their cross-space references to point to the new target locations. The old
 * references are replaced with new ones that point to the updated space/environment.
 */
const updateEntriesWithNewXSpaceRef: MigrationFunction = (migration) => {
  contentTypesToMigrate.forEach(
    ({ contentTypeId, fieldsWithXSpaceRefChange }) => {
      // Get list of field IDs that need to be migrated
      const fieldsToMigrate = fieldsWithXSpaceRefChange.map(
        ({ fieldId }) => fieldId
      );

      // Transform all entries of this content type
      migration.transformEntries({
        contentType: contentTypeId,
        from: fieldsToMigrate, // Fields to read from
        to: fieldsToMigrate, // Fields to write to (same fields)
        shouldPublish: config.shouldPublish,
        transformEntryForLocale: (fromFields, currentLocale) => {
          const transformedFields: Record<string, any> = {};

          // Process each field that has cross-space reference changes
          for (const xSpaceRefChange of fieldsWithXSpaceRefChange) {
            const originalValue =
              fromFields[xSpaceRefChange.fieldId][currentLocale];

            // Check if this field contains a cross-space entry reference
            if (
              originalValue &&
              originalValue.sys?.linkType === "Contentful:Entry"
            ) {
              // Find the matching allowed resource change for this reference
              const allowedResourceChange =
                xSpaceRefChange.matchedAllowedResources.find((match) =>
                  originalValue.sys.urn.startsWith(
                    `${match.current.source}/entries`
                  )
                );

              // If we found a match, update the reference to point to the new location
              if (allowedResourceChange) {
                transformedFields[xSpaceRefChange.fieldId] = {
                  ...originalValue,
                  sys: {
                    ...originalValue.sys,
                    // Update the URN to point to the new space/environment
                    // Keep the entry ID and version, just change the space/environment part
                    urn: `${
                      allowedResourceChange.new.source
                    }/${originalValue.sys.urn.split("/").slice(-2).join("/")}`,
                  },
                };
              }
            }
          }

          return transformedFields;
        },
      });
    }
  );
};

/**
 * MIGRATION STEP 3: Remove old cross-space reference locations from content types
 *
 * This final step cleans up the content type definitions by removing the old
 * cross-space reference targets. After this step, only the new reference locations
 * will be allowed, completing the migration process.
 */
const updateContentTypeToRemoveOldXSpaceRefLocations: MigrationFunction = (
  migration
) => {
  contentTypesToMigrate.forEach(
    ({ contentTypeId, fieldsWithXSpaceRefChange }) => {
      const contentType = migration.editContentType(contentTypeId);

      fieldsWithXSpaceRefChange.forEach(
        ({ fieldId, matchedAllowedResources, originalAllowedResources }) => {
          contentType.editField(fieldId).allowedResources(
            deduplicateAllowedResources([
              // Keep only allowed resources that are NOT in our migration list
              ...originalAllowedResources.filter(
                (allowedResource) =>
                  !matchedAllowedResources.some(
                    ({ current }) =>
                      current.source ===
                      (allowedResource as ContentfulEntryResource).source
                  )
              ),
              // Add the new allowed resources
              ...matchedAllowedResources.map(
                ({ new: newAllowedResource }) => newAllowedResource
              ),
            ])
          );
        }
      );
    }
  );
};

/**
 * Utility function to remove duplicate allowed resources from a field's configuration
 * This prevents duplicate entries when adding new cross-space reference targets
 *
 * @param allowedResources - Array of allowed resources that may contain duplicates
 * @returns Deduplicated array of allowed resources
 */
const deduplicateAllowedResources = (
  allowedResources: NonNullable<ContentFields["allowedResources"]>
) => {
  return allowedResources.filter(
    (resource, index, self) =>
      // Keep resources that don't have a 'source' property (e.g., same-space references)
      // For resources with 'source', only keep the first occurrence
      !("source" in resource) ||
      self.findIndex((t) => "source" in t && t.source === resource.source) ===
        index
  );
};

/**
 * Utility function to run multiple migration functions sequentially
 *
 * This ensures migrations run in the correct order and provides progress feedback.
 * Sequential execution is important because each migration step depends on the
 * completion of the previous step.
 *
 * @param defaultConfig - Base configuration for all migrations (space, token, etc.)
 * @returns Function that executes an array of migration functions
 */
const runMigrations =
  (defaultConfig: Omit<RunMigrationConfig, "migrationFunction">) =>
  async (migrationFunctions: MigrationFunction[]) => {
    for (const migrationFunction of migrationFunctions) {
      await runMigration({ ...defaultConfig, migrationFunction }).then(() =>
        console.log(
          `Migration ${migrationFunctions.indexOf(migrationFunction) + 1} of ${
            migrationFunctions.length
          } Done!`
        )
      );
    }
  };

/**
 * Configuration interface for the migration script
 *
 * @property spaceId - The Contentful space ID where the migration will run
 * @property environmentId - The environment within the space to migrate
 * @property accessToken - Contentful management API access token
 * @property crossSpaceReferenceTargetChanges - Array of reference changes to apply
 * @property shouldPublish - Whether to publish the entries after migration
 */
type Config = {
  spaceId: string;
  environmentId: string;
  accessToken: string;
  crossSpaceReferenceTargetChanges: {
    current: { spaceId: string; environmentId?: string };
    new: { spaceId: string; environmentId?: string };
  }[];
  shouldPublish?: ITransformEntriesConfig["shouldPublish"];
  yes?: boolean;
};

/**
 * Interface representing a content type with fields that have cross-space reference changes
 *
 * @property contentTypeId - The ID of the content type being modified
 * @property fieldsWithXSpaceRefChange - Array of fields that need cross-space reference updates
 */
type ContentTypeResourceLinkFields = {
  contentTypeId: string;
  fieldsWithXSpaceRefChange: {
    fieldId: string;
    matchedAllowedResources: {
      current: ContentfulEntryResource;
      new: ContentfulEntryResource;
    }[];
    originalAllowedResources: NonNullable<ContentFields["allowedResources"]>;
  }[];
};

// Execute the migration sequence
// The order is critical: content types must be updated first to allow new references,
// then entries are migrated, and finally old reference targets are removed
runMigrations({
  spaceId: config.spaceId,
  environmentId: config.environmentId,
  accessToken: config.accessToken,
  requestBatchSize: 100, // Process entries in batches to avoid API rate limits
  yes: config.yes || false, // Don't ask for confirmation
})([
  updateContentTypeWithNewXSpaceRefLocations, // Step 1: Add new reference targets
  updateEntriesWithNewXSpaceRef, // Step 2: Migrate existing entries
  updateContentTypeToRemoveOldXSpaceRefLocations, // Step 3: Remove old reference targets
]).catch((e) => console.error(e));
