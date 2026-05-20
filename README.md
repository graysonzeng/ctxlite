# ctxlite

Lightweight project context compiler for coding agents.

## Install

During development:

```bash
npm link
```

After publishing:

```bash
npm install -g ctxlite
```

## Usage

```bash
ctxlite init
ctxlite update
ctxlite pack
ctxlite doctor
```

Agent protocol:

- Read `.ctx/brief.md` before non-trivial work.
- Run `ctxlite update` after meaningful work.
- Treat `.ctx/proposals.md` as suggestions until a human promotes them into docs, rules, or skills.
