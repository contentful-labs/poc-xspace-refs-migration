# Contentful Cross-Space Reference Migration Tool

This tool migrates cross-space references in Contentful from one space/environment to another. It's designed to handle scenarios where content references need to be updated to point to different spaces or environments.

## Overview

The migration process involves three sequential steps:

1. **Add new cross-space reference locations** to content types
2. **Update existing entries** to use the new reference locations
3. **Remove old cross-space reference locations** from content types

## ⚠️ Important Warnings

- **This script is not thoroughly tested** - Only use for non-production purposes or in environments where you can safely recover from potential issues
- **Test in a development environment first**
- **Have a rollback plan** in case of issues
- **Monitor your GraphQL API** for reference resolution errors after migration

## Prerequisites

- Node.js (version 14 or higher)
- npm or yarn package manager
- Contentful Management API access token
- Access to the Contentful spaces you want to migrate

## Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

### 2. Environment Configuration

Copy the example environment file and configure it:

```bash
cp .env.example .env
```

Edit the `.env` file and add your Contentful access token:

```bash
CONTENTFUL_ACCESS_TOKEN=your_contentful_management_api_token_here
```

#### How to Get Your Contentful Access Token

1. Go to your Contentful account settings
2. Navigate to **Account settings > CMA tokens**
3. Create a new personal access token or use an existing one
4. Copy the token and add it to your `.env` file

### 3. Update Migration Configuration

Edit the configuration in `src/xspace-refs-migration.ts` to match your migration requirements:

```typescript
const config: Config = {
  // The Contentful space where you want to run the migration
  spaceId: "your_target_space_id",

  // The environment within that space to migrate
  environmentId: "dev", // or "master", "staging", etc.

  // Your personal access token (loaded from environment variable)
  accessToken: process.env.CONTENTFUL_ACCESS_TOKEN!,

  // Define which cross-space references should be migrated
  crossSpaceReferenceTargetChanges: [
    {
      current: { spaceId: "old_space_id", environmentId: "master" },
      new: { spaceId: "new_space_id", environmentId: "dev" },
    },
  ],

  // Whether to publish the entries after migration
  shouldPublish: "preserve", // or true to auto-publish

  // Whether to skip the confirmation prompt during migration
  yes: false,
};
```

#### Configuration Options

- **spaceId**: The Contentful space ID where you want to run the migration
- **environmentId**: The environment within that space (e.g., "master", "dev", "staging")
- **crossSpaceReferenceTargetChanges**: Array of reference changes to apply
  - **current**: Where references currently point
  - **new**: Where you want references to point after migration
- **shouldPublish**:
  - `"preserve"`: Keep current publish status (default)
  - `true`: Automatically publish all migrated entries
- **yes**: Set to `true` to skip confirmation prompts

#### Common Migration Scenarios

**Scenario 1: Moving references from master to dev environment (same space)**

```typescript
{
  current: { spaceId: "abc123", environmentId: "master" },
  new: { spaceId: "abc123", environmentId: "dev" }
}
```

**Scenario 2: Moving references from one space to another**

```typescript
{
  current: { spaceId: "oldspace123", environmentId: "master" },
  new: { spaceId: "newspace456", environmentId: "master" }
}
```

**Scenario 3: Multiple migrations in one run**

```typescript
[
  {
    current: { spaceId: "space1", environmentId: "master" },
    new: { spaceId: "space1", environmentId: "dev" },
  },
  {
    current: { spaceId: "space2", environmentId: "master" },
    new: { spaceId: "space2", environmentId: "dev" },
  },
];
```

## Running the Migration

### Basic Usage

```bash
npm run migrate
```

This will:

1. Load your configuration from the TypeScript file
2. Connect to Contentful using your access token
3. Execute the three-step migration process
4. Provide progress updates and completion status

### What Happens During Migration

1. **Step 1**: Scans content types for cross-space references and adds new allowed resource targets
2. **Step 2**: Updates all entries to use the new reference locations while preserving existing data
3. **Step 3**: Removes the old reference targets from content types

### Publishing Behavior

By default (`shouldPublish: "preserve"`):

- Draft/changed entries will have references updated in the Management API
- Changes won't be visible in the Content Delivery API until manually published
- Published entries remain published after migration

If you set `shouldPublish: true`:

- All processed entries will be automatically published
- Changes become immediately visible in the Content Delivery API

## Troubleshooting

### Common Issues

**GraphQL Errors After Migration**

- Error: `Cannot find the schema for space xyz and environment abc`
- **Cause**: Entries with migrated references that weren't published may cause GraphQL resolution errors
- **Solution**: Publish the affected entries or set `shouldPublish: true` in your config

**Access Token Issues**

- Ensure your token has Management API access
- Verify the token has permissions for the target space
- Check that the token hasn't expired

**TypeScript Compilation Errors**

- Ensure you have compatible TypeScript and Node.js versions
- Run `npm install` to ensure all dependencies are installed

### Getting Help

If you encounter issues:

1. Check the console output for detailed error messages
2. Verify your configuration matches your Contentful setup
3. Test with a small subset of content first
4. Ensure you have proper backups before running on production data

## Development

To modify the migration script:

1. Edit `src/xspace-refs-migration.ts`
2. Update the configuration section with your requirements
3. Test in a development environment first
4. Run with `npm run migrate`

## License

ISC
