import type { RealtimeChannel, Session, User } from '@supabase/supabase-js'
import { isSupabaseConfigured, supabase } from './supabase.ts'

export type OnlineMember = {
  id: string
  group_id: string
  user_id: string
  name: string
  avatar_id: string | null
  is_host: boolean
}

export type OnlineGroup = {
  id: string
  host_user_id: string
  invite_code: string
  status: 'lobby' | 'playing' | 'finished'
  game_key: string
  game_state: unknown | null
}

export type OnlineGroupSnapshot = {
  group: OnlineGroup
  members: OnlineMember[]
}

function requireClient() {
  if (!supabase) throw new Error('Supabase ist nicht konfiguriert.')
  return supabase
}

function createInviteCode() {
  return crypto.randomUUID().slice(0, 8).toUpperCase()
}

export function onlineAvailable() {
  return isSupabaseConfigured && Boolean(supabase)
}

export async function getSession() {
  if (!supabase) return null
  const { data, error } = await supabase.auth.getSession()
  console.log('[Auth] current session', data.session)
  if (error) throw error
  return data.session
}

export function onAuthChanged(callback: (session: Session | null) => void) {
  if (!supabase) return () => {}
  const { data } = supabase.auth.onAuthStateChange((event, session) => {
    console.log('[Auth] state changed', event, session)
    callback(session)
  })
  return () => data.subscription.unsubscribe()
}

export async function signUp(email: string, password: string) {
  console.log('[Auth] signUp clicked', email)
  const { data, error } = await requireClient().auth.signUp({ email, password })
  console.log('[Auth] signUp response', data)
  if (error) console.error('[Auth] signUp error', error)
  if (error) throw error
  return data
}

export async function signIn(email: string, password: string) {
  console.log('[Auth] signIn clicked', email)
  const { data, error } = await requireClient().auth.signInWithPassword({ email, password })
  console.log('[Auth] signIn response', data)
  if (error) console.error('[Auth] signIn error', error)
  if (error) throw error
  return data.session
}

export async function signOut() {
  console.log('[Auth] signOut clicked')
  const { error } = await requireClient().auth.signOut()
  if (error) console.error('[Auth] signOut error', error)
  if (error) throw error
}

export async function saveRemoteProfile(user: User, name: string, avatarId: string | null) {
  const { error } = await requireClient().from('user_profiles').upsert({
    user_id: user.id,
    email: user.email ?? '',
    name,
    avatar_id: avatarId,
    updated_at: new Date().toISOString(),
  })
  if (error) throw error
}

export async function loadRemoteProfile(userId: string) {
  const { data, error } = await requireClient()
    .from('user_profiles')
    .select('name, avatar_id')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw error
  return data as { name: string; avatar_id: string | null } | null
}

export async function createOnlineGroup(user: User, name: string, avatarId: string | null, gameKey = 'blobfahrer') {
  const inviteCode = createInviteCode()
  const { data: group, error: groupError } = await requireClient()
    .from('game_groups')
    .insert({ host_user_id: user.id, invite_code: inviteCode, game_key: gameKey, status: 'lobby' })
    .select()
    .single()
  if (groupError) throw groupError
  await joinOnlineGroup(group.invite_code, user, name, avatarId, true)
  return group as OnlineGroup
}

export async function joinOnlineGroup(inviteCode: string, user: User, name: string, avatarId: string | null, hostOverride = false) {
  const normalizedCode = inviteCode.trim().toUpperCase()
  const { data: group, error: groupError } = await requireClient()
    .from('game_groups')
    .select()
    .eq('invite_code', normalizedCode)
    .maybeSingle()
  if (groupError) throw groupError
  if (!group) throw new Error('Gruppe nicht gefunden.')
  const isHost = hostOverride || group.host_user_id === user.id
  const { error: memberError } = await requireClient().from('game_members').upsert({
    group_id: group.id,
    user_id: user.id,
    name,
    avatar_id: avatarId,
    is_host: isHost,
    joined_at: new Date().toISOString(),
  }, { onConflict: 'group_id,user_id' })
  if (memberError) throw memberError
  return group as OnlineGroup
}

export async function fetchGroupSnapshot(groupId: string) {
  const client = requireClient()
  const [{ data: group, error: groupError }, { data: members, error: membersError }] = await Promise.all([
    client.from('game_groups').select().eq('id', groupId).single(),
    client.from('game_members').select().eq('group_id', groupId).order('joined_at', { ascending: true }),
  ])
  if (groupError) throw groupError
  if (membersError) throw membersError
  return { group: group as OnlineGroup, members: (members ?? []) as OnlineMember[] }
}

export function subscribeToGroup(groupId: string, callback: () => void) {
  if (!supabase) return () => {}
  const client = supabase
  const channel: RealtimeChannel = client.channel(`game-group-${groupId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'game_groups', filter: `id=eq.${groupId}` }, callback)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'game_members', filter: `group_id=eq.${groupId}` }, callback)
    .subscribe()
  return () => { void client.removeChannel(channel) }
}

export async function removeOnlineMember(groupId: string, userId: string) {
  const { error } = await requireClient().from('game_members').delete().eq('group_id', groupId).eq('user_id', userId)
  if (error) throw error
}

export async function leaveOnlineGroup(groupId: string, userId: string) {
  await removeOnlineMember(groupId, userId)
}

export async function updateOnlineGameState(groupId: string, gameState: unknown, status: OnlineGroup['status'] = 'playing') {
  const { error } = await requireClient().from('game_groups').update({
    status,
    game_state: gameState,
    updated_at: new Date().toISOString(),
  }).eq('id', groupId)
  if (error) throw error
}

export function inviteUrl(inviteCode: string, gameKey = 'busfahrer') {
  return `${window.location.origin}${window.location.pathname}#${gameKey}-online?invite=${encodeURIComponent(inviteCode)}`
}
