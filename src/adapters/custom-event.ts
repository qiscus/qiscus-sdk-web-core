import mitt from 'mitt'
import { IQRealtimeAdapter } from './realtime'
import { IQMqttAdapter } from './mqtt'

type Callback<T> = (data: T) => void
export default function CustomEventAdapter(mqtt: IQMqttAdapter, userId: string) {
  // @ts-ignore
  const events: mitt.Emitter = mitt();
  const subscribedTopics = new Map<number, Callback<any>>();

  const reTopic = /^r\/[\w]+\/[\w]+\/e$/i;
  const getTopic = roomId => `r/${roomId}/${roomId}/e`;

  return {
    publishEvent (roomId: number, payload: any) {
      const _payload = JSON.stringify({ sender: userId, data: payload });
      mqtt.publishCustomEvent(roomId, userId, payload)
    }
  }
}
