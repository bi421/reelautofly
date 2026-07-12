import express from 'express'

const app = express()
const PORT = process.env.PORT ?? 5000

app.get('/health', (_req, res) => res.json({ status: 'ok' }))

app.listen(PORT, () => {
  console.log(`Publisher service listening on port ${PORT}`)
})
