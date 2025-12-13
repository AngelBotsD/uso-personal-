"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
exports.default = queueJob;

const _queueAsyncBuckets = new Map();
const _gcLimit = 10000;
const _maxConcurrentJobs = 5;

async function _asyncQueueExecutor(queue, cleanup) {
    let offt = 0;
    let activeJobs = 0;

    // eslint-disable-next-line no-constant-condition
    while (true) {
        const limit = Math.min(queue.length, _gcLimit);
        const availableSlots = _maxConcurrentJobs - activeJobs;
        const jobsToProcess = Math.min(limit - offt, availableSlots);

        for (let i = 0; i < jobsToProcess; i++) {
            const jobIndex = offt + i;
            const job = queue[jobIndex];
            activeJobs++;

            job.promise = new Promise((resolve, reject) => {
                job.resolve = resolve;
                job.reject = reject;
            });

            
            (async () => {
                try {
                    const result = await job.awaitable();
                    job.resolve(result);
                } catch (e) {
                    job.reject(e);
                } finally {
                    activeJobs--;
                }
            })();
        }

        if (limit < queue.length) {
            if (limit >= _gcLimit) {
                queue.splice(0, limit);
                offt = 0;
            } else {
                offt += jobsToProcess;
            }
        } else {
            break;
        }
    }

    cleanup();
}

function queueJob(bucket, awaitable) {
    if (typeof bucket !== "string") {
        console.warn("Unhandled bucket type (for naming):", typeof bucket, bucket);
    }

    let inactive = false;

    if (!_queueAsyncBuckets.has(bucket)) {
        _queueAsyncBuckets.set(bucket, []);
        inactive = true;
    }

    const queue = _queueAsyncBuckets.get(bucket);

    const job = {
        awaitable,
        promise: null,
        resolve: null,
        reject: null
    };

    queue.push(job);

    if (inactive) {
        _asyncQueueExecutor(queue, () => _queueAsyncBuckets.delete(bucket));
    }

    return job.promise;
}