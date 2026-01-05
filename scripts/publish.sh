#!/bin/bash
set -e

PACKAGE_NAME="api-ape"

# Get local version from package.json
LOCAL_VERSION=$(node -p "require('./package.json').version")
echo "📦 Local version: $LOCAL_VERSION"

# Get published version from npm
NPM_VERSION=$(npm view "$PACKAGE_NAME" version 2>/dev/null || echo "0.0.0")
echo "🌐 npm version: $NPM_VERSION"

# Check if versions match - if so, bump the patch version
if [[ "$LOCAL_VERSION" == "$NPM_VERSION" ]]; then
  echo "⚠️  Local version matches npm. Incrementing patch version..."
  
  # Parse version parts
  IFS='.' read -r MAJOR MINOR PATCH <<< "$LOCAL_VERSION"
  NEW_PATCH=$((PATCH + 1))
  NEW_VERSION="$MAJOR.$MINOR.$NEW_PATCH"
  
  echo "📝 Bumping version: $LOCAL_VERSION → $NEW_VERSION"
  
  # Update package.json with new version
  node -e "
    const fs = require('fs');
    const pkg = require('./package.json');
    pkg.version = '$NEW_VERSION';
    fs.writeFileSync('./package.json', JSON.stringify(pkg, null, 2) + '\n');
  "
  
  # Amend the last commit with the version bump
  git add package.json
  git commit --amend --no-edit
  git push --force-with-lease
  
  LOCAL_VERSION="$NEW_VERSION"
  echo "✅ Version bumped and commit amended"
else
  echo "✅ Local version ($LOCAL_VERSION) differs from npm ($NPM_VERSION). Proceeding..."
fi

TAG="v$LOCAL_VERSION"

# Check if tag already exists
if git rev-parse "$TAG" >/dev/null 2>&1; then
  echo "❌ Error: Tag $TAG already exists."
  exit 1
fi

# Create and push tag
echo "🏷️  Creating tag $TAG..."
git tag -a "$TAG" -m "Release $TAG"
git push origin "$TAG"

# Create GitHub release (triggers the publish workflow)
echo "🚀 Creating GitHub release..."
gh release create "$TAG" \
  --title "$TAG" \
  --generate-notes

echo "✅ Release $TAG created! The GitHub Action will publish to npm with provenance."
echo "   Watch the workflow at: https://github.com/codemeasandwich/api-ape/actions"
