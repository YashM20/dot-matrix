/** Training worker: runs forward + BPTT for its share of the batch and returns the summed gradient. */
import { parentPort, workerData } from 'node:worker_threads'
import { makeTrainer, paramCount, type Dims } from './core'

const { dims, target, maxSteps } = workerData as { dims: Dims; target: Float32Array; maxSteps: number }
const tr = makeTrainer(dims, target, maxSteps)
parentPort!.on('message', (msg: { params: Float32Array; jobs: { x: Float32Array; steps: number; seed: number }[] }) => {
  const grad = new Float32Array(paramCount(dims))
  const results = msg.jobs.map(j => tr.run(j.x, j.steps, j.seed, msg.params, grad))
  parentPort!.postMessage({ grad, results }, [grad.buffer, ...results.map(r => r.out.buffer)])
})
