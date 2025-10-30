---
description: Add, commit with conventional commit message, and push to remote
---

# Git Push Command

Please perform the following git operations:

1. Check git status and diff to understand all changes
2. Check recent commit history to follow the repository's commit message style
3. Stage all modified and untracked files (except sensitive files like .env)
4. Create a commit with a conventional commit message format:
   - Type: feat/fix/docs/style/refactor/test/chore
   - Subject: Clear and concise description
   - Body: Detailed breakdown of changes
5. Push to origin/main
6. Verify the push was successful

**Important:**
- Use conventional commit format
- Analyze the changes and choose appropriate commit type
- Do not commit sensitive files (.env, credentials, etc.)
- Follow Korean language for commit messages if the project uses Korean
- Add the Claude Code signature at the end

Example format:
```
feat: add new feature

- Add component X
- Update configuration Y

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
```
