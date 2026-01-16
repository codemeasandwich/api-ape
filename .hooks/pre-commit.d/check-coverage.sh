#!/usr/bin/env bash
# Coverage Check
# Runs simulator tests with coverage and enforces thresholds
# This runs the mock-based E2E tests via Jest
#
# Current target: 91% (lines/statements), 81% (branches), 94% (functions)
# Goal: 100% coverage

set -e

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Coverage Check (Simulator Tests)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Run tests with coverage
echo "  Running simulator tests with coverage..."
echo ""

# Run Jest with coverage thresholds
# --coverageThreshold enforces minimum coverage
npm test -- --coverage --coverageThreshold='{"global":{"branches":81,"functions":94,"lines":91,"statements":91}}' 2>&1

RESULT=$?

if [ $RESULT -eq 0 ]; then
    echo ""
    echo "  ✓ Coverage check passed"
else
    echo ""
    echo "  ✗ Coverage check failed"
    exit 1
fi

exit 0
