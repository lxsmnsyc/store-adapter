/**
 * @license
 * MIT License
 *
 * Copyright (c) 2021 Alexis Munsayac
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 *
 *
 * @author Alexis Munsayac <alexis.munsayac@gmail.com>
 * @copyright Alexis Munsayac 2021
 */
import {
  Subscription,
  useConstant,
  useConstantCallback,
  useMemoCondition,
  useSubscription,
} from '@lyonph/react-hooks';
import React, {
  FC,
  useDebugValue,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  createNullaryModel,
  useScopedModelExists,
  useValue,
} from 'react-scoped-model';

type NotifierListener<T> = (value: T) => void;

export default class Notifier<T> {
  private alive = true;

  private listeners = new Set<NotifierListener<T>>();

  private value: T;

  constructor(value: T) {
    this.value = value;
  }

  public subscribe(listener: NotifierListener<T>): () => void {
    if (this.alive) {
      this.listeners.add(listener);
    }

    return () => {
      if (this.alive) {
        this.listeners.delete(listener);
      }
    };
  }

  public notify(value: T): void {
    if (this.alive) {
      this.value = value;
      this.listeners.forEach((listener) => {
        listener(value);
      });
    }
  }

  public destroy(): void {
    if (this.alive) {
      this.listeners.clear();
      this.alive = false;
    }
  }

  public read(): T {
    return this.value;
  }

  public hasListeners(): boolean {
    return this.listeners.size > 0;
  }
}

type Subscribe = (callback: () => void) => Unsubscribe;
type Unsubscribe = undefined | (() => void) | void;

interface StoreAdapterBase<T> {
  readonly read: () => T;
  readonly subscribe: Subscribe;
}

interface StoreAdapterOptions<T> extends StoreAdapterBase<T> {
  readonly id?: string;
  readonly shouldUpdate?: (prev: T, next: T) => boolean;
  readonly keepAlive?: boolean;
}

export interface StoreAdapter<T> extends StoreAdapterBase<T> {
  readonly id: string;
  readonly shouldUpdate: (prev: T, next: T) => boolean;
  readonly keepAlive: boolean;
}

let index = 0;

function getIndex() {
  const current = index;
  index += 1;
  return current;
}

function defaultUpdate<T>(prev: T, next: T): boolean {
  return !Object.is(prev, next);
}

export function createStoreAdapter<T>(
  options: StoreAdapterOptions<T>,
): StoreAdapter<T> {
  return {
    id: `Store-${getIndex()}`,
    shouldUpdate: defaultUpdate,
    keepAlive: false,
    ...options,
  };
}

interface StoreAdapterContext {
  read<T>(store: StoreAdapter<T>): T;
  subscribe<T>(store: StoreAdapter<T>, callback: () => void): () => void;
}

const StoreAdapterCore = createNullaryModel<StoreAdapterContext>(() => {
  const isMounted = useRef(true);

  useEffect(() => () => {
    isMounted.current = false;
  }, []);

  const memory = useConstant(() => new Map<string, StoreAdapterMemory<any>>());
  const registered = useConstant(() => new Set<StoreAdapter<any>>());

  const pendingStores = useConstant(() => new Set<StoreAdapter<any>>());
  const [pendingStoresVersion, setPendingStoresVersion] = useState([]);

  const pendingUpdates = useRef<(() => void)[]>([]);
  const [pendingUpdatesVersion, setPendingUpdatesVersion] = useState([]);

  const batchUpdates = useConstantCallback((callback: () => void) => {
    // If the store was dispatched during render phase
    // and the store notification is synchronous
    // to the dispatch call, we defer the proxy update
    setTimeout(() => {
      // Update has been deferred, but the timing is off to the
      // React cycle. We defer the update again to the passive
      // effects.
      if (isMounted.current) {
        pendingUpdates.current.push(callback);
        setPendingUpdatesVersion([]);
      }
    });
  });

  // This effect runs all the pending store registrations.
  useEffect(() => {
    if (pendingStores.size) {
      const stores = new Set(pendingStores);
      // Clear the current pending list
      pendingStores.clear();

      // Iterate the pending list
      stores.forEach((store) => {
        // Check instance
        const instance = memory.get(store.id);
        if (instance && !registered.has(store)) {
          const checkForUpdates = () => {
            // Only subscribe if StoreAdapter root
            if (isMounted.current) {
              // Read our next value
              const nextValue = store.read();

              if (store.shouldUpdate(instance.notifier.read(), nextValue)) {
                batchUpdates(() => {
                  instance.notifier.notify(nextValue);
                });
              }
            }
          };

          // Subscribe to the store
          const unsubscribe = store.subscribe(checkForUpdates);

          // Check for updates immediately
          // to know if the store has changed
          // states
          checkForUpdates();

          // If there's a subscription, we set it for later cleanup
          if (unsubscribe) {
            instance.unsubscribe = unsubscribe;
          }

          registered.add(store);
        }
      });
    }
  }, [batchUpdates, memory, pendingStores, pendingStoresVersion, registered]);

  // This effect is for running all scheduled updates
  // from proxy stores
  useEffect(() => {
    const batch = pendingUpdates.current;
    if (batch.length) {
      pendingUpdates.current = [];

      batch.forEach((update) => {
        update();
      });
    }
  }, [pendingUpdatesVersion]);

  // This effect performs cleanup on unmount
  useEffect(() => () => {
    memory.forEach((item) => {
      if (item.unsubscribe) {
        item.unsubscribe();
      }
      item.notifier.destroy();
    });
    memory.clear();
  }, [memory]);

  return useConstant(() => {
    const getInstance = <T, >(store: StoreAdapter<T>): StoreAdapterMemory<T> => {
      // Get instance
      let instance = memory.get(store.id) as StoreAdapterMemory<T>;
      if (!instance) {
        // Create instance if nothing is found
        const proxy = new Notifier<T>(store.read());
        instance = {
          notifier: proxy,
        };

        // If root is still mounted, write to memory
        if (isMounted.current) {
          memory.set(store.id, instance);

          pendingStores.add(store);

          setTimeout(() => {
            if (isMounted.current) {
              setPendingStoresVersion([]);
            }
          });
        }
      }
      return instance;
    };

    return ({
      read: (store) => (
        getInstance(store).notifier.read()
      ),
      subscribe: (store, callback) => {
        const instance = getInstance(store);

        const unsubscribe = instance.notifier.subscribe(callback);

        return () => {
          // Attempt to unsubscribe
          unsubscribe();

          // Self-destroy instance of there are no listeners
          if (!(store.keepAlive || instance.notifier.hasListeners())) {
            if (instance.unsubscribe) {
              instance.unsubscribe();
            }
            instance.notifier.destroy();

            memory.delete(store.id);
            registered.delete(store);
          }
        };
      },
    });
  });
}, {
  displayName: 'StoreAdapterCore',
});

interface StoreAdapterMemory<T> {
  notifier: Notifier<T>;
  unsubscribe?: () => void;
}

function useStoreAdapterRestriction(): void {
  const exists = useScopedModelExists(StoreAdapterCore);

  if (!exists) {
    throw new Error('Attempt to access missing StoreAdapterContext.');
  }
}

function identity<T, R>(value: T): R {
  return value as unknown as R;
}

interface UseStoreAdapterOptions<T, R> {
  getSnapshot?: (value: T) => R;
  shouldUpdate?: (prev: R, next: R) => boolean;
}

export function useStoreAdapter<T>(
  store: StoreAdapter<T>,
): T;
export function useStoreAdapter<T, R>(
  store: StoreAdapter<T>,
  options: UseStoreAdapterOptions<T, R>,
): R;
export function useStoreAdapter<T, R>(
  store: StoreAdapter<T>,
  options?: UseStoreAdapterOptions<T, R>,
): R {
  useStoreAdapterRestriction();

  // Apply default values
  const getSnapshot = options?.getSnapshot ?? identity;
  const shouldUpdate = options?.shouldUpdate ?? defaultUpdate;

  // Access adapter root context
  const context = useValue(StoreAdapterCore);

  // Create subscription
  const subscription = useMemoCondition(
    (): Subscription<R> => ({
      read: () => getSnapshot(context.read(store)),
      subscribe: (callback) => context.subscribe(store, callback),
      shouldUpdate,
    }),
    {
      context,
      store,
      getSnapshot,
      shouldUpdate,
    },
    (prev, next) => (
      !(Object.is(prev.store, next.store)
      && Object.is(prev.context, next.context)
      && Object.is(prev.getSnapshot, next.getSnapshot)
      && Object.is(prev.shouldUpdate, next.shouldUpdate))
    ),
  );

  const state = useSubscription(subscription);

  useDebugValue(state);

  return state;
}

export const StoreAdapterRoot: FC = ({ children }) => {
  const context = useScopedModelExists(StoreAdapterCore);

  // There only should be a single root for every tree
  if (context) {
    return <>{children}</>;
  }

  return (
    <StoreAdapterCore.Provider>
      {children}
    </StoreAdapterCore.Provider>
  );
};

if (process.env.NODE_ENV !== 'production') {
  StoreAdapterRoot.displayName = 'StoreAdapterRoot';
}
