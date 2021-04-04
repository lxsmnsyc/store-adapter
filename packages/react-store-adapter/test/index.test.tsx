import React from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { createStore } from 'redux';
import { createStoreAdapter, StoreAdapterRoot, useStoreAdapter } from '../src';
import '@testing-library/jest-dom';
import { supressWarnings, restoreWarnings } from './supress-warnings';

interface Action {
  type: 'INCREMENT' | 'DECREMENT';
}

beforeEach(() => {
  jest.useFakeTimers();
});
afterEach(() => {
  cleanup();
  jest.useRealTimers();
});

describe('StoreAdapter', () => {
  describe('useStoreAdapter', () => {
    it('should throw an error if used without StoreAdapterRoot', () => {
      const store = createStore<number, Action, unknown, unknown>((state = 0, action: Action) => {
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

      function Count() {
        const count = useStoreAdapter(storeAdapter);

        return <span>Count: {count}</span>;
      }

      expect(() => {
        supressWarnings();
        render(<Count />);
        restoreWarnings();
      }).toThrow();
    });
    it('should capture the initial state if store is undispatched.', () => {
      const store = createStore<number, Action, unknown, unknown>((state = 0, action: Action) => {
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

      function Count() {
        const count = useStoreAdapter(storeAdapter);

        return <span>Count: {count}</span>;
      }

      const result = render((
        <StoreAdapterRoot>
          <Count />
        </StoreAdapterRoot>
      ));

      expect(result.container).toHaveTextContent('Count: 0');
    });
    it('should capture the new state if store is dispatcted before render.', () => {
      const store = createStore<number, Action, unknown, unknown>((state = 0, action: Action) => {
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

      store.dispatch({ type: 'INCREMENT' });

      function Count() {
        const count = useStoreAdapter(storeAdapter);

        return <span>Count: {count}</span>;
      }

      const result = render((
        <StoreAdapterRoot>
          <Count />
        </StoreAdapterRoot>
      ));

      expect(result.container).toHaveTextContent('Count: 1');
    });
    it('should capture the safe state if the store dispatched during render', () => {
      const store = createStore<number, Action, unknown, unknown>((state = 0, action: Action) => {
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

      function Count() {
        const count = useStoreAdapter(storeAdapter);

        store.dispatch({ type: 'INCREMENT' });

        return <span>Count: {count}</span>;
      }

      const result = render((
        <StoreAdapterRoot>
          <Count />
        </StoreAdapterRoot>
      ));

      expect(result.container).toHaveTextContent('Count: 0');
    });
    it('should capture the safe state then apply correctness if the store dispatched during render', async () => {
      const store = createStore<number, Action, unknown, unknown>((state = 0, action: Action) => {
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

      function Count() {
        const count = useStoreAdapter(storeAdapter);

        return <span>Count: {count}</span>;
      }

      const result = render((
        <StoreAdapterRoot>
          <Count />
        </StoreAdapterRoot>
      ));

      store.dispatch({ type: 'INCREMENT' });

      expect(result.container).toHaveTextContent('Count: 0');

      act(() => {
        jest.runAllTimers();
      });

      expect(result.container).toHaveTextContent('Count: 1');
    });

    describe('with custom getSnapshot', () => {
      it('should capture the transformed initial state', () => {
        const store = createStore<number, Action, unknown, unknown>((state = 0, action: Action) => {
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

        function getSnapshot(count: number): string {
          return `Count: ${count}`;
        }

        function Count() {
          const message = useStoreAdapter(storeAdapter, {
            getSnapshot,
          });

          return <span>{message}</span>;
        }

        const result = render((
          <StoreAdapterRoot>
            <Count />
          </StoreAdapterRoot>
        ));

        expect(result.container).toHaveTextContent('Count: 0');
      });
      it('should capture the transformed updated state', () => {
        const store = createStore<number, Action, unknown, unknown>((state = 0, action: Action) => {
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

        function getSnapshot(count: number): string {
          return `Count: ${count}`;
        }

        function Count() {
          const message = useStoreAdapter(storeAdapter, {
            getSnapshot,
          });

          return <span>{message}</span>;
        }

        const result = render((
          <StoreAdapterRoot>
            <Count />
          </StoreAdapterRoot>
        ));

        store.dispatch({ type: 'INCREMENT' });

        expect(result.container).toHaveTextContent('Count: 0');

        act(() => {
          jest.runAllTimers();
        });
        expect(result.container).toHaveTextContent('Count: 1');
      });
    });
  });
});
