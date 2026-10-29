import { createBackup, verifyBackup } from './backup.ts'

try {
  if (process.argv.slice(2).some((arg) => arg !== '--verify') || process.argv.length > 3) {
    throw new Error('Argumentos inválidos.')
  }
  const verify = process.argv.includes('--verify')
  const path = await (verify ? verifyBackup(process.env) : createBackup(process.env))
  console.log(
    `${verify ? 'Backup e restauração conferidos em banco descartável' : 'Backup criado'}: ${path}`,
  )
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Backup não concluído.')
  process.exitCode = 1
}
