#!/usr/bin/env bash
# Integration Test Check
# Runs cross-runtime integration tests on main branch
# Only runs if integration tests exist and runtimes are available

source "$(dirname "$0")/utils.sh"

print_header "Integration Tests"

INTEGRATION_DIR="integration"

# Check if integration tests exist
if [ ! -d "$INTEGRATION_DIR" ]; then
    echo "  ⚪ No integration tests found (skipping)"
    exit 0
fi

# Check available runtimes
RUNTIMES_AVAILABLE=0
RUNTIMES_TESTED=0
RUNTIMES_FAILED=0

# Test Node.js (required)
if command -v node &> /dev/null; then
    echo "  Testing Node.js..."
    if node "$INTEGRATION_DIR/node/run.js" 2>/dev/null; then
        ((RUNTIMES_TESTED++))
        echo "  ✓ Node.js integration passed"
    else
        ((RUNTIMES_FAILED++))
        echo "  ✗ Node.js integration failed"
    fi
else
    echo "  ✗ Node.js not found (required)"
    exit 1
fi

# Test Bun (optional)
if command -v bun &> /dev/null; then
    echo "  Testing Bun..."
    if bun run "$INTEGRATION_DIR/bun/run.ts" 2>/dev/null; then
        ((RUNTIMES_TESTED++))
        echo "  ✓ Bun integration passed"
    else
        ((RUNTIMES_FAILED++))
        echo "  ✗ Bun integration failed"
    fi
else
    echo "  ⚪ Bun not available (skipping)"
fi

# Test Deno (optional)
if command -v deno &> /dev/null; then
    echo "  Testing Deno..."
    if deno run --allow-all "$INTEGRATION_DIR/deno/run.ts" 2>/dev/null; then
        ((RUNTIMES_TESTED++))
        echo "  ✓ Deno integration passed"
    else
        ((RUNTIMES_FAILED++))
        echo "  ✗ Deno integration failed"
    fi
else
    echo "  ⚪ Deno not available (skipping)"
fi

# Test Express (if dependencies installed)
if [ -d "$INTEGRATION_DIR/express/node_modules" ]; then
    echo "  Testing Express..."
    if (cd "$INTEGRATION_DIR" && node express/test.js 2>/dev/null); then
        ((RUNTIMES_TESTED++))
        echo "  ✓ Express integration passed"
    else
        ((RUNTIMES_FAILED++))
        echo "  ✗ Express integration failed"
    fi
else
    echo "  ⚪ Express dependencies not installed (run: cd integration/express && npm install)"
fi

# Test Next.js (if dependencies installed)
if [ -d "$INTEGRATION_DIR/nextjs/node_modules" ]; then
    echo "  Testing Next.js..."
    if (cd "$INTEGRATION_DIR" && node nextjs/test.js 2>/dev/null); then
        ((RUNTIMES_TESTED++))
        echo "  ✓ Next.js integration passed"
    else
        ((RUNTIMES_FAILED++))
        echo "  ✗ Next.js integration failed"
    fi
else
    echo "  ⚪ Next.js dependencies not installed (run: cd integration/nextjs && npm install)"
fi

# Summary
echo ""
echo "  Integration Tests: $RUNTIMES_TESTED tested, $RUNTIMES_FAILED failed"

if [ $RUNTIMES_FAILED -gt 0 ]; then
    exit 1
fi

exit 0
