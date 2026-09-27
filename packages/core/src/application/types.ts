import type { Actor } from "../domain/common/actor";
import type { RequestContainer } from "./di/types";

export type ServiceArgs<T> = {
  container: RequestContainer;
  input: T;
};

/** Arguments of a usecase that requires a signed-in `Actor`. */
export type ActorServiceArgs<T> = ServiceArgs<T> & Readonly<{ actor: Actor }>;
