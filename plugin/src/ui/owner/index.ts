/** Владельческая часть интерфейса: создание пространства, участники, сводка. */

export { CreateSpaceModal } from './create-space';
export type { CreateSpaceModalDeps } from './create-space';
export { createSpaceConnection } from './create-space-run';
export type { CreateSpaceDeps, CreateSpaceInput, CreateSpaceResult } from './create-space-run';
export { validateCreateSpace } from './create-space-validate';

export { MembersTab } from './members';
export type { MembersDeps } from './members';
export { InviteModal } from './members-invite';
export type { InviteDeps } from './members-invite';

export { SpaceInfoView, fetchSpaceInfo, renderSpaceInfo } from './space-info';
export type { SpaceInfo, SpaceInfoDeps } from './space-info';
