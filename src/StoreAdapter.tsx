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
  createContext,
  FC,
  memo,
  MutableRefObject,
  useContext,
  useDebugValue,
  useEffect,
  useRef,
  useState,
} from 'react';

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
}

export interface StoreAdapter<T> extends StoreAdapterBase<T> {
  readonly id: string;
  readonly shouldUpdate: (prev: T, next: T) => boolean;
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
    ...options,
  };
}

interface StoreAdapterContext {
  register<T>(store: StoreAdapter<T>): void;
  read<T>(store: StoreAdapter<T>): T;
  subscribe<T>(store: StoreAdapter<T>, callback: () => void): () => void;
}

type StoreAdapterContextRef = MutableRefObject<StoreAdapterContext | undefined>;

const StoreAdapterContext = (
  createContext<StoreAdapterContextRef | undefined>(undefined)
);

interface StoreAdapterMemory<T> {
  notifier: Notifier<T>;
  unsubscribe?: () => void;
}

function useStoreAdapterContextRef(): StoreAdapterContextRef {
  const context = useContext(StoreAdapterContext);

  if (context) {
    return context;
  }

  throw new Error('Attempt to access missing StoreAdapterContext reference.');
}

function useStoreAdapterContext(): StoreAdapterContext {
  const context = useStoreAdapterContextRef();

  if (context.current) {
    return context.current;
  }

  throw new Error('Attempt to access missing StoreAdapterContext.');
}

const StoreAdapterCore = memo(() => {
  const isMounted = useRef(true);

  useEffect(() => () => {
    isMounted.current = false;
  }, []);

  const memory = useConstant(() => new Map<string, StoreAdapterMemory<any>>());

  const pendingStores = useRef<StoreAdapter<any>[]>([]);
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
    const batch = pendingStores.current;
    if (batch.length) {
      // Clear the current pending list
      pendingStores.current = [];

      // Iterate the pending list
      batch.forEach((store) => {
        // Check instance
        const instance = memory.get(store.id);
        if (instance) {
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
        }
      });
    }
  }, [batchUpdates, memory, pendingStoresVersion]);

  // This effect is for running all scheduled updates
  // from proxy stores
  useEffect(() => {
    const batch = pendingUpdates.current;
    if (batch.length) {
      pendingUpdates.current = [];

      batch.forEach((update) => {
        if (isMounted.current) {
          update();
        }
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

  const contextRef = useStoreAdapterContextRef();

  if (!contextRef.current) {
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
        }
      }
      return instance;
    };
    contextRef.current = {
      register: (store) => {
        if (isMounted.current) {
          pendingStores.current.push(store);
          setPendingStoresVersion([]);
        }
      },
      read: (store) => getInstance(store).notifier.read(),
      subscribe: (store, callback) => {
        const instance = getInstance(store);

        const unsubscribe = instance.notifier.subscribe(callback);

        return () => {
          // Attempt to unsubscribe
          unsubscribe();

          // Self-destroy instance of there are no listeners
          if (!instance.notifier.hasListeners()) {
            if (instance.unsubscribe) {
              instance.unsubscribe();
            }
            instance.notifier.destroy();

            memory.delete(store.id);
          }
        };
      },
    };
  }

  return null;
}, () => true);

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
  // Apply default values
  const getSnapshot = options?.getSnapshot ?? identity;
  const shouldUpdate = options?.shouldUpdate ?? defaultUpdate;

  // Access adapter root context
  const context = useStoreAdapterContext();

  useEffect(() => {
    context.register(store);
  }, [store, context]);

  // Create subscription
  const subscription = useMemoCondition(
    (): Subscription<R> => ({
      read: () => getSnapshot(context.read(store)),
      subscribe: (callback) => context.subscribe(store, callback),
      shouldUpdate,
    }),
    {
      store,
      getSnapshot,
      shouldUpdate,
    },
    (prev, next) => (
      !Object.is(prev.store, next.store)
      || !Object.is(prev.getSnapshot, next.getSnapshot)
      || !Object.is(prev.shouldUpdate, next.shouldUpdate)
    ),
  );

  const state = useSubscription(subscription);

  useDebugValue(state);

  return state;
}

const StoreAdapterRootInternal: FC = ({ children }) => {
  const ref = useRef<StoreAdapterContext>();
  return (
    <StoreAdapterContext.Provider value={ref}>
      <StoreAdapterCore />
      {children}
    </StoreAdapterContext.Provider>
  );
};

export const StoreAdapterRoot: FC = ({ children }) => {
  const context = useContext(StoreAdapterContext);

  // There only should be a single root for every tree
  if (context) {
    return <>{children}</>;
  }

  return (
    <StoreAdapterRootInternal>
      {children}
    </StoreAdapterRootInternal>
  );
};

if (process.env.NODE_ENV !== 'production') {
  StoreAdapterContext.displayName = 'StoreAdapterContext';
  StoreAdapterCore.displayName = 'StoreAdapterCore';
  StoreAdapterRootInternal.displayName = 'StoreAdapterRootInternal';
  StoreAdapterRoot.displayName = 'StoreAdapterRoot';
}
