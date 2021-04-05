# preact-store-adapter

> Connect stores and mutable sources to Preact the correct way.

[![NPM](https://img.shields.io/npm/v/preact-store-adapter.svg)](https://www.npmjs.com/package/preact-store-adapter) [![JavaScript Style Guide](https://badgen.net/badge/code%20style/airbnb/ff5a5f?icon=airbnb)](https://github.com/airbnb/javascript)

## Install

```bash
yarn install preact-store-adapter
```

## Usage

```tsx
import {
  StoreAdapterRoot,
  createStoreAdapter,
  useStoreAdapter
} from 'preact-store-adapter';

// An example of a non-Preact global state
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

`preact-store-adapter` to provide a unified way for Preact to interact with different kinds of external states and mutable sources (much like what React's Mutable Source's future goal is.)

`createStoreAdapter(options)` requires two fields:

- `read(): State`: Provides a way for the store adapter to access the current state of the store.
- `subscribe(callback: Function): Function | undefined`: Provides a way for the store adapter to subscribe to the store and receive further updates. It accepts a callback value that is subscribed to the store and must return a cleanup callback which is used to unsubscribe from the store.
- `shouldUpdate(prev: State, next: State): boolean`: Optional. Tells when the store adapter should update the tracked state. This is useful for emulating immutable states equality (deep comparison). Defaults to `Object.is`.

- `keepAlive: boolean`: Prevents automatic store cleanup. Defaults to false.

`createStoreAdapter` then returns a store adapter instance which is used in the Preact environment (specifically, `useStoreAdapter`).

### Hook

`useStoreAdapter(storeAdapter)` is a hook that provides a way for Preact components to consume states and updates from the external sources. `useStoreAdapter` accepts a store adapter instance as the first parameter and returns the safe state of the external store. It may also optionally accept an options object as the second parameter:

- `getSnapshot(currentState: State): NewState`: provides a way to transform the safe state. It receives the safe state and must return a new state derived from the safe state.
- `shouldUpdate(prev: State, next: State): boolean`: tells when should the component update.

### Root

`<StoreAdapterRoot>` is the core of `preact-store-adapter`. It handles the communication between your Preact app and the mutable sources and also keeps track of safe states. The component must always be found in the root of your Preact app. If there are multiple instances, `preact-store-adapter` attemps to only implement a single instance per Preact tree.

### Safe-state tracking

`preact-store-adapter` internally keeps track of which state provided by the external source is safe for the UI components to use. This is to prevent UI tearing where components receive different values unexpectedly.

### UI correctness

`preact-store-adapter` detects whenever there's a potential tear in the component, allowing for the component to re-render again with the potential safe state.

### Dispatch correctness

`preact-store-adapter` attempts to correct when stores are dispatched. Different timings and schedules of store dispatches may affect how Preact apps work, which in turn can cause unexpected UI-related issues.

### Selective state updates

`preact-store-adapter` provides a way to transform and filter state, which adds a benefit for the UI to save render time specially if the state is considered equal.

### Automatic store cleanup

To prevent memory leaks, `preact-store-adapter` automatically cleans up store instance internally if those stores has no listeners. `createStoreAdapter` can accept `keepAlive: true` to prevent automatic cleanup.

## Examples

### Redux

```tsx
import { createStore } from 'redux';

// An example of a non-Preact global state
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

## License

MIT © [lxsmnsyc](https://github.com/LyonInc)
