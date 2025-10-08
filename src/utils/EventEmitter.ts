// src/utils/EventEmitter.ts

import log from "loglevel";
import { Plugin } from "obsidian";

type Listener<T> = (payload: T) => void;

const logger = log.getLogger("EventEmitter");

export class EventEmitter<Events extends object> {
	private listeners: {
		[K in keyof Events]?: Array<Listener<Events[K]>>;
	} = {};

	constructor(private register: Plugin["register"]) {}

	on<K extends keyof Events>(
		event: K,
		listener: Listener<Events[K]>,
	): () => void {
		this.listeners[event] ??= [];
		this.listeners[event].push(listener);

		this.register(() => this.off(event, listener));
		return () => this.off(event, listener);
	}

	off<K extends keyof Events>(event: K, listener: Listener<Events[K]>): void {
		this.listeners[event] = this.listeners[event]?.filter(
			(l) => l !== listener,
		);
	}

	once<K extends keyof Events>(event: K, listener: Listener<Events[K]>): void {
		const onceListener: Listener<Events[K]> = (payload) => {
			listener(payload);
			this.off(event, onceListener);
		};
		this.register(() => this.off(event, onceListener));
		this.on(event, onceListener);
	}

	emit<K extends keyof Events>(event: K, payload: Events[K]): void {
		logger.debug(`Emitting event: ${event.toString()}`, payload);
		this.listeners[event]?.forEach((l) => l(payload));
	}
}
