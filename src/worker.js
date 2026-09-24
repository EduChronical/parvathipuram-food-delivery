import { config } from './config.js';
import { runAssignmentPass } from './workers/assignment.worker.js';
import { runUnassignedTimeoutPass } from './workers/unassigned.worker.js';
import { runNotificationPass } from './workers/notification.worker.js';

let stopping = false;
const loops = [];

function startLoop(name, intervalMs, task) {
  let running = false;
  const tick = async () => {
    if (stopping || running) return;
    running = true;
    try {
      const result = await task();
      if (process.env.NODE_ENV !== 'test') console.log(JSON.stringify({ level: 'info', worker: name, result, at: new Date().toISOString() }));
    } catch (error) {
      console.error(JSON.stringify({ level: 'error', worker: name, error: error?.stack ?? String(error), at: new Date().toISOString() }));
    } finally { running = false; }
  };
  const timer = setInterval(tick, intervalMs);
  timer.unref();
  loops.push(timer);
  tick();
}

startLoop('assignment', config.assignmentPollMs, runAssignmentPass);
startLoop('unassigned-timeout', config.unassignedPollMs, runUnassignedTimeoutPass);
startLoop('notification', config.notificationPollMs, runNotificationPass);

for (const signal of ['SIGINT','SIGTERM']) {
  process.on(signal, () => {
    stopping = true;
    for (const timer of loops) clearInterval(timer);
    setTimeout(() => process.exit(0), 250).unref();
  });
}
