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
TAG_EXISTS=false
if git rev-parse "$TAG" >/dev/null 2>&1; then
  TAG_EXISTS=true
  echo "🏷️  Tag $TAG already exists."
  
  # Check if release already exists for this tag
  if command -v gh &> /dev/null && gh release view "$TAG" &> /dev/null; then
    echo "❌ Error: Release $TAG already exists. Nothing to do."
    exit 1
  else
    echo "📝 No release found for $TAG. Creating release..."
  fi
fi

if [[ "$TAG_EXISTS" == false ]]; then
  # Create and push tag
  echo "🏷️  Creating tag $TAG..."
  git tag -a "$TAG" -m "Release $TAG"
  git push origin "$TAG"
fi

# Create GitHub release (triggers the publish workflow)
echo "🚀 Creating GitHub release..."

REPO_OWNER="codemeasandwich"
REPO_NAME="api-ape"

# Try gh CLI first, fall back to curl
if command -v gh &> /dev/null; then
  gh release create "$TAG" \
    --title "$TAG" \
    --generate-notes
else
  # Use GitHub API with curl
  if [[ -z "$GITHUB_TOKEN" ]]; then
    echo "❌ Error: GITHUB_TOKEN environment variable is required."
    echo "   Set it with: export GITHUB_TOKEN=your_token"
    echo "   Or install GitHub CLI: brew install gh && gh auth login"
    exit 1
  fi
  
  # Create release via GitHub API
  RESPONSE=$(curl -s -X POST \
    -H "Authorization: token $GITHUB_TOKEN" \
    -H "Accept: application/vnd.github.v3+json" \
    "https://api.github.com/repos/$REPO_OWNER/$REPO_NAME/releases" \
    -d "{
      \"tag_name\": \"$TAG\",
      \"name\": \"$TAG\",
      \"generate_release_notes\": true
    }")
  
  # Check if release was created
  if echo "$RESPONSE" | grep -q '"id"'; then
    echo "✅ Release created via GitHub API"
  else
    echo "❌ Failed to create release:"
    echo "$RESPONSE"
    exit 1
  fi
fi

echo "✅ Release $TAG created! The GitHub Action will publish to npm with provenance."
echo "   Watch the workflow at: https://github.com/$REPO_OWNER/$REPO_NAME/actions"
