import { IQUser } from 'model'
import { loginOrRegisterParams } from 'api'

export const loginOrRegister = (o: loginOrRegisterParams) => ({
  email: o.userId,
  password: o.userKey,
  username: o.username,
  avatar_url: o.avatarUrl,
  device_token: o.deviceToken,
  extras: o.extras,
})

export const verifyIdentityToken = (o: { identityToken: string }) => ({
  identity_token: o.identityToken,
})
export const patchProfile = (u: IQUser) => ({
  name: u.name,
  avatar_url: u.avatarUrl,
  extras: u.extras,
})
export const userRooms = () => ({})
