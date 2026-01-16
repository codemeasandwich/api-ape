# Chat App Stories Module Files

This module contains complete user journey tests simulating a real-time chat application. These tests combine multiple api-ape features into realistic scenarios.

## Guidelines

- **Realistic scenarios** — Tests should mimic actual chat app usage patterns
- **Multiple users** — Most tests involve 2+ users interacting
- **Feature combination** — Combine RPC, broadcast, lifecycle features in each test

## Directory Structure

```
chat-app/
├── index.test.js           # Main test file that imports all scenarios
└── complete-user-journey/  # Full chat session test scenarios
```

## Directories

### `complete-user-journey/`

Tests simulating complete chat sessions including:
- Users joining and leaving
- Message exchange between users
- Rapid message bursts
- Many simultaneous users
