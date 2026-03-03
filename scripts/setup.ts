import { parseSetupArgs } from './lib/setup-args'
import { runSetup } from './lib/setup-orchestrator'

runSetup(parseSetupArgs())
