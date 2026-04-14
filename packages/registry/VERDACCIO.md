# Verdaccio verification harness

The automated test `packages/cli/tests/m6-registry-e2e.test.ts` stubs the
npm CLI, so it can run hermetically in CI. To exercise the full
publish → install story against a real npm-API-compatible registry, run
the manual harness below.

## One-shot verdaccio

```bash
# 1. Install verdaccio.
npm install -g verdaccio

# 2. Start it.  Default config is fine; it listens on http://localhost:4873.
verdaccio

# 3. In a second terminal, create a scoped user.
npm adduser --registry http://localhost:4873
#    (user: toy, pass: anything, email: toy@example.com)

# 4. Publish the fixture toy node.
cd packages/registry/tests/fixtures/node-toy
npm --registry http://localhost:4873 publish

# 5. Install into a scratch workflow.
mkdir -p /tmp/agenteer-verd-demo && cd /tmp/agenteer-verd-demo
npm init -y
node /path/to/agenteer/packages/cli/dist/bin/agenteer.js install \
  @toy/node-triage@^1.2.0 \
  --workflow-dir $(pwd) \
  --registry http://localhost:4873 \
  --grant "net.http:api.github.com/**" \
  --yes

# 6. Inspect the resulting framework.lock + framework.workflow.yaml.
cat framework.workflow.yaml
cat framework.lock
```

Expected outcome: install succeeds; `framework.lock` records a sha256
matching the fixture's canonical manifest hash. A subsequent spawn that
exceeds the workflow grants is denied at auth time by the kernel — same
behavior proven by the hermetic test.
