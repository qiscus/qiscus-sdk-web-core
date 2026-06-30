import type { MqttClient, IClientOptions, IClientPublishOptions } from 'mqtt'
export type { IClientPublishOptions, MqttClient, IClientOptions } from 'mqtt'

export function connect(brokerUrl: string, options?: IClientOptions): MqttClient
