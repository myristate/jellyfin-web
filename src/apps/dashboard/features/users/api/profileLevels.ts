import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models/base-item-dto';
import type { UnratedItem } from '@jellyfin/sdk/lib/generated-client/models/unrated-item';

import type { ApiClient } from 'jellyfin-apiclient';

/** A kind of profile such as Child, Teen or Adult, with its own restrictions (Finly). */
export interface ProfileLevel {
    Id: string;
    Name: string;
    /** The highest rating score allowed, on the server's age based scale, or none for no limit. */
    MaxParentalRating?: number | null;
    MaxParentalSubRating?: number | null;
    BlockUnratedItems: UnratedItem[];
    AllowedTags: string[];
    BlockedTags: string[];
    /** Whether the level restricts anything, only those are offered for removing an item from all their profiles. */
    IsRestricted?: boolean;
}

export const NO_LEVEL = '00000000000000000000000000000000';

export const getProfileLevels = (apiClient: ApiClient): Promise<ProfileLevel[]> =>
    apiClient.getJSON(apiClient.getUrl('ProfileLevels'));

/** Levels rarely change, so item menus and the kids view share one copy per server until a level is saved. */
const levelsCache = new Map<string, Promise<ProfileLevel[]>>();

export const getProfileLevelsCached = (apiClient: ApiClient): Promise<ProfileLevel[]> => {
    const key = apiClient.serverId() || '';
    let levels = levelsCache.get(key);
    if (!levels) {
        levels = getProfileLevels(apiClient);
        levelsCache.set(key, levels);
        // Try again next time rather than keep a failure
        levels.catch(() => levelsCache.delete(key));
    }
    return levels;
};

/** Dispatched on the document when who can see what may have changed (Finly). */
export const PROFILE_ACCESS_CHANGED = 'finlyprofileaccesschange';

export interface ProfileAccessChangedDetail {
    /** The item whose access changed, or none when a level or a profile's restrictions changed. */
    itemId?: string;
}

/**
 * Tell the kids view and item menus that access changed: for one item after it was added to or removed from
 * profiles, or for everything after a level or a profile's parental controls were saved.
 */
export const notifyProfileAccessChanged = (itemId?: string) => {
    if (!itemId) levelsCache.clear();
    document.dispatchEvent(new CustomEvent<ProfileAccessChangedDetail>(PROFILE_ACCESS_CHANGED, { detail: { itemId } }));
};

export const saveProfileLevel = (apiClient: ApiClient, level: ProfileLevel): Promise<ProfileLevel> =>
    apiClient.ajax({
        type: 'POST',
        url: apiClient.getUrl('ProfileLevels'),
        data: JSON.stringify(level),
        contentType: 'application/json',
        dataType: 'json'
    }) as Promise<ProfileLevel>;

export const deleteProfileLevel = (apiClient: ApiClient, id: string) =>
    apiClient.ajax({ type: 'DELETE', url: apiClient.getUrl(`ProfileLevels/${id}`) });

export const getHiddenItems = (apiClient: ApiClient, userId: string): Promise<{ Items: BaseItemDto[] }> =>
    apiClient.getJSON(apiClient.getUrl(`Users/${userId}/HiddenItems`));

export const hideItem = (apiClient: ApiClient, userId: string, itemId: string) =>
    apiClient.ajax({ type: 'POST', url: apiClient.getUrl(`Users/${userId}/HiddenItems/${itemId}`) });

export const restoreItem = (apiClient: ApiClient, userId: string, itemId: string) =>
    apiClient.ajax({ type: 'DELETE', url: apiClient.getUrl(`Users/${userId}/HiddenItems/${itemId}`) });

export const hideItemFromLevel = (apiClient: ApiClient, itemId: string, levelId: string) =>
    apiClient.ajax({ type: 'POST', url: apiClient.getUrl(`Items/${itemId}/HideFromLevel/${levelId}`) });

/** A profile with restrictions, as the server lists it with who can see what. */
export interface AccessProfile {
    Id: string;
    Name: string;
    LevelId?: string | null;
}

export interface ProfileAccess {
    Profiles: AccessProfile[];
    /** For each item asked about, the ids of the restricted profiles that can see it. */
    Items: Record<string, string[]>;
}

export const getProfileAccess = (apiClient: ApiClient, itemIds: string[]): Promise<ProfileAccess> =>
    apiClient.getJSON(apiClient.getUrl('Items/ProfileAccess', { ids: itemIds.join(',') }));

export const allowItem = (apiClient: ApiClient, userId: string, itemId: string) =>
    apiClient.ajax({ type: 'POST', url: apiClient.getUrl(`Users/${userId}/AllowedItems/${itemId}`) });

export const allowItemForLevel = (apiClient: ApiClient, itemId: string, levelId: string) =>
    apiClient.ajax({ type: 'POST', url: apiClient.getUrl(`Items/${itemId}/AllowForLevel/${levelId}`) });

export const sameId = (a?: string | null, b?: string | null) =>
    !!a && !!b && a.replace(/-/g, '').toLowerCase() === b.replace(/-/g, '').toLowerCase();
