// Re-export only the runtime zod schemas from the generated API surface.
// The orval-generated `./generated/types` directory exports TypeScript
// interfaces with the same names as the zod schemas in `./generated/api`
// (e.g. `CreateAuditLogBody`), which causes a TS2308 "already exported"
// collision when both barrels are flattened. Consumers that need pure
// TS types can either:
//   - infer them from the zod schemas via `z.infer<typeof X>`, or
//   - import them from `@workspace/api-client-react` (which exposes
//     `./generated/api.schemas`).
export * from "./generated/api";
