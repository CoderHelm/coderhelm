# Marketing plugin (example)

A CoderHelm plugin that drafts launch posts, emails and blog updates from each
release, in the team's brand voice, for an editor to approve.

This is the plugin built step by step in
[Build the marketing plugin](https://docs.coderhelm.com/plugins/walkthrough/).
The docs site's tests validate it against the manifest schema on every build.

```
plugin.yaml                  the manifest
skills/brand-voice/SKILL.md  how the writing sounds
skills/launch-checklist/SKILL.md
agents/launch-writer.md      the agent that writes the drafts
```

Each team's brand guide, connections and approvers live in that team's
settings, never in this repo.
