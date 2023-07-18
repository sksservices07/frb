const queue = (concurrency = 3) => {
  let running = 0;
  const taskQueue = [];

  const runTask = async (task) => {
    console.log("Task running...");
    running++;
    await task(() => {
      console.log("Task ended...");
      running--;
      if (taskQueue.length > 0) {
        runTask(taskQueue.shift());
      }
    });
  };

  const enqueueTask = (task) => taskQueue.push(task);

  return {
    push: (task) => (running < concurrency ? runTask(task) : enqueueTask(task)),
  };
};


const tasks = queue()

async function one() {
  setTimeout(() => {
   console.log("Function one ended") 
  }, 1000);
}
async function two() {
  setTimeout(() => {
   console.log("Function two ended") 
  }, 1000);
}
async function three() {
  setTimeout(() => {
   console.log("Function two ended") 
  }, 1000);
}

async function init() {
  tasks.push(one)
  tasks.push(two)
  tasks.push(three)
}

init()

