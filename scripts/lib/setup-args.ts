import { hasJsonFlag } from './cli-telemetry'
import { z } from 'zod'

const ArgsSchema = z.object({
  force: z.boolean(),
  json: z.boolean(),
})

export interface SetupArgs {
  force: boolean
  json: boolean
}

export function parseSetupArgs(argv = process.argv): SetupArgs {
  return ArgsSchema.parse({
    force: argv.includes('--force'),
    json: hasJsonFlag(argv),
  })
}
