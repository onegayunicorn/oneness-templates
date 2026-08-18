# Getting started

## Prerequisites

Use Node.js 18 or newer and pnpm. From the repository root, install dependencies with `pnpm install`.

## Validate the monorepo

Run `pnpm typecheck` to type-check each workspace, `pnpm test` to run the package validation scripts, and `pnpm build` to emit package artifacts under each package's `dist` directory.

## Initialize a template

Run `pnpm cli list` to view available templates. Then run `pnpm cli init backend-openapi --name my-api --directory ./my-api`. Review the generated Cloudflare configuration and bindings before running `pnpm cli deploy`.

## Deployment checklist

Before deployment, configure all required Cloudflare bindings, replace placeholder zone IDs and hostnames, provide secrets through environment variables or secret bindings, and review authentication and CORS settings for the target environment.
