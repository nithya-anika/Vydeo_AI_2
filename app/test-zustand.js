const { createStore } = require('zustand/vanilla');

const useStore = createStore((set, get) => ({
  scenes: [{id: 1, v: 0}, {id: 2, v: 0}, {id: 3, v: 0}],
  updateScene: (id, patch) => {
    const scenes = get().scenes.map(s => s.id === id ? { ...s, ...patch } : s);
    set({ scenes });
  }
}));

const store = useStore.getState();
store.scenes.forEach(s => {
  store.updateScene(s.id, { v: 5 });
});

console.log(useStore.getState().scenes);
