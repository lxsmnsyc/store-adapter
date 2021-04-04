# react-store-adapter

> Connect stores and mutable sources to React the correct way.

[![NPM](https://img.shields.io/npm/v/react-store-adapter.svg)](https://www.npmjs.com/package/react-store-adapter) [![JavaScript Style Guide](https://badgen.net/badge/code%20style/airbnb/ff5a5f?icon=airbnb)](https://github.com/airbnb/javascript)

## Install

```bash
yarn install react-store-adapter
```

## Usage

```tsx
import {
  StoreAdapterRoot,
  createStoreAdapter,
  useStoreAdapter
} from 'react-store-adapter';

// An example of a non-React global state
const store = Redux.createStore((state = 0, action) => {
  switch (action.type) {
    case 'INCREMENT':
      return state + 1
    case 'DECREMENT':
      return state - 1
    default:
      return state
  }
});

// Create our store adapter
const storeAdapter = createStoreAdapter({
  // How to read the store's state
  read: () => store.getState(),

  // how to subscribe to the store
  subscribe: (callback) => store.subscribe(callback),
});

// Simple reading
function Count() {
  // Read our state
  const count = useStoreAdapter(storeAdapter);

  return (
    <h1>Count: {count}</h1>
  );
}

// Transformed reading
function getSnapshot(count) {
  return `Count: ${count}`;
}

function TransformedCount() {
  const message = useStoreAdapter(storeAdapter, {
    getSnapshot,
  });

  return <h1>{message}</h1>;
}

// With state memoization
function shouldUpdate(value) {
  return value > 10;
}

function MemoizedCount() {
  // Will only start re-rendering after count > 10
  const count = useStoreAdapter(storeAdapter, {
    shouldUpdate,
  });

  return <h1>Count: {count}</h1>;
}

// Render our app
<StoreAdapterRoot>
  <Count />
  <TransformCount />
  <MemoizedCount />
</StoreAdapterRoot>
```

## Features

### State-agnostic Store Adapters

`react-store-adapter` to provide a unified way for React to interact with different kinds of external states and mutable sources (much like what React's Mutable Source's future goal is.)

`createStoreAdapter(options)` requires two fields:

- `read(): State`: Provides a way for the store adapter to access the current state of the store.
- `subscribe(callback: Function): Function | undefined`: Provides a way for the store adapter to subscribe to the store and receive further updates. It accepts a callback value that is subscribed to the store and must return a cleanup callback which is used to unsubscribe from the store.
- `shouldUpdate(prev: State, next: State): boolean`: Optional. Tells when the store adapter should update the tracked state. This is useful for emulating immutable states equality (deep comparison).

`createStoreAdapter` then returns a store adapter instance which is used in the React environment (specifically, `useStoreAdapter`).

### Hook

`useStoreAdapter(storeAdapter)` is a hook that provides a way for React components to consume states and updates from the external sources. `useStoreAdapter` accepts a store adapter instance as the first parameter and returns the safe state of the external store. It may also optionally accept an options object as the second parameter:

- `getSnapshot(currentState: State): NewState`: provides a way to transform the safe state. It receives the safe state and must return a new state derived from the safe state.
- `shouldUpdate(prev: State, next: State): boolean`: tells when should the component update.

### Root

`<StoreAdapterRoot>` is the core of `react-store-adapter`. It handles the communication between your React app and the mutable sources and also keeps track of safe states. The component must always be found in the root of your React app. If there are multiple instances, `react-store-adapter` attemps to only implement a single instance per React tree.

### Safe-state tracking

`react-store-adapter` internally keeps track of which state provided by the external source is safe for the UI components to use. This is to prevent UI tearing where components receive different values unexpectedly.

### UI correctness

`react-store-adapter` detects whenever there's a potential tear in the component, allowing for the component to re-render again with the potential safe state.

### Dispatch correctness

`react-store-adapter` attempts to correct when stores are dispatched. Different timings and schedules of store dispatches may affect how React apps work, which in turn can cause unexpected UI-related issues.

### Selective state updates

`react-store-adapter` provides a way to transform and filter state, which adds a benefit for the UI to save render time specially if the state is considered equal.

## Examples

### Redux

```tsx
import { createStore } from 'redux';

// An example of a non-React global state
const store = createStore((state = 0, action) => {
  switch (action.type) {
    case 'INCREMENT':
      return state + 1;
    case 'DECREMENT':
      return state - 1;
    default:
      return state;
  }
});

// Create our store adapter
const storeAdapter = createStoreAdapter({
  // How to read the store's state
  read: () => store.getState(),

  // how to subscribe to the store
  subscribe: (callback) => store.subscribe(callback),
});
```

## Comparison with React's Mutable Source

`react-store-adapter` is inspired by the implementation of the proposed [useMutableSource](https://github.com/reactjs/rfcs/blob/master/text/0147-use-mutable-source.md) with minor differences.

- `createStoreAdapter` and `createMutableSource` provides different interfaces.
- `react-store-adapter` allows selective state updates while React's Mutable Source keeps track of state versions to signify state changes.
- `react-store-adapter` works in React 16.8.0 and above, while React's Mutable Source is still in development.
- `react-store-adapter` requires the `<StoreAdapterRoot>` to be implemented. React's Mutable Source doesn't have any as it lives within the VDOM.
- `react-store-adapter` does not correct it's UI during render phase, it does so during passive effects. React's Mutable Source does so when it detects state changes during render phase.
- `react-store-adapter` defers state updates of the wrapped store to the passive effects. This allows store updates to be scheduled at the same phase as passive effects and to not interupt the render phase.

There are also some similarities:

- Both keeps tracks of the safe state. Safe state is a kind of state that is safe for the UI to present. This prevents the UI from tearing during render phase whenever the store updates untimely.
- Both achieves UI correctness, just at different times.

## License

MIT © [lxsmnsyc](https://github.com/LyonInc)
