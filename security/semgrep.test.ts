// Fixtures do analisador: não importar nem executar este arquivo.
// ruleid: no-dynamic-code
eval(input)
// ruleid: no-dynamic-code
new Function(input)
// ruleid: no-unsafe-prisma-query
db.$queryRawUnsafe(input)
// ruleid: no-unsafe-prisma-query
db.$executeRawUnsafe(input)
// ruleid: no-disabled-tls
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
// ruleid: no-disabled-tls
fetch(url, { rejectUnauthorized: false })
// ruleid: no-shell-spawn
spawn('cmd', args, { shell: true })
// ruleid: no-shell-spawn
exec(input)
// ruleid: no-unescaped-dom
element.innerHTML = input
// ok: no-unescaped-dom
element.textContent = input
// ok: no-unsafe-prisma-query
db.$queryRaw`SELECT id FROM "Product" WHERE name = ${input}`
// ok: no-shell-spawn
spawn('node', ['script.ts'], { shell: false })
