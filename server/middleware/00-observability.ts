import { defineEventHandler } from 'h3'
import { observeRequest } from '../utils/observability.ts'

export default defineEventHandler(observeRequest)
