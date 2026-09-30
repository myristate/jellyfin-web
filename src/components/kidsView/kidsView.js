/**
 * Kids view (Finly): lets a parent browsing a library see which films and shows a child's profile, or every profile on
 * a level such as Child, can see. A child icon next to the view, sort and filter buttons picks the profile or level,
 * and each poster then gets a badge: full when all of them can see it, faint when only some can.
 */
import { ServerConnections } from 'lib/jellyfin-apiclient';
import globalize from 'lib/globalize';
import actionsheet from 'components/actionSheet/actionSheet';
import { getProfileLevels } from 'apps/dashboard/features/users/api/profileLevels';

import './kidsView.scss';

const STORAGE_KEY = 'finly-kidsview';
/** Dispatched on the document when the kids view is turned on, off or pointed at other profiles. */
export const KIDS_VIEW_CHANGED = 'kidsviewchange';
const BATCH_SIZE = 100;

let isAdministrator = null;
let checkedUserId = null;
let target = null;
let profiles = [];
let levels = [];
const access = new Map();
const pending = new Set();
let fetchTimer = null;

const normalize = id => (id || '').replace(/-/g, '').toLowerCase();

function loadTarget() {
    try {
        target = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    } catch {
        target = null;
    }
}

function saveTarget() {
    try {
        if (target) localStorage.setItem(STORAGE_KEY, JSON.stringify(target));
        else localStorage.removeItem(STORAGE_KEY);
    } catch {
        // per viewer convenience only
    }
}

function apiClient() {
    return ServerConnections.currentApiClient();
}

async function checkAdministrator() {
    const client = apiClient();
    if (!client?.getCurrentUserId()) return false;
    try {
        const user = await client.getCurrentUser();
        return !!user?.Policy?.IsAdministrator;
    } catch {
        return false;
    }
}

/** The profiles a target covers: the profile itself, or everyone on the level. */
function targetProfiles() {
    if (!target) return [];
    if (target.type === 'user') return [ normalize(target.id) ];
    return profiles.filter(p => normalize(p.LevelId) === normalize(target.id)).map(p => normalize(p.Id));
}

function badgeState(itemId) {
    const visibleTo = access.get(normalize(itemId));
    if (!visibleTo) return null;
    const covered = targetProfiles();
    if (!covered.length) return 'none';
    const count = covered.filter(p => visibleTo.includes(p)).length;
    if (count === 0) return 'none';
    return count === covered.length ? 'all' : 'some';
}

function decorate(card) {
    const id = card.getAttribute('data-id');
    const scalable = card.querySelector('.cardScalable') || card.querySelector('.cardBox');
    if (!id || !scalable) return;

    let badge = scalable.querySelector('.kidsViewBadge');
    const state = target ? badgeState(id) : null;
    if (!state || state === 'none') {
        badge?.remove();
        return;
    }

    if (!badge) {
        badge = document.createElement('div');
        badge.className = 'kidsViewBadge';
        badge.innerHTML = '<span class="material-icons child_care" aria-hidden="true"></span>';
        scalable.appendChild(badge);
    }
    badge.classList.toggle('kidsViewBadge-some', state === 'some');
    badge.title = state === 'all' ?
        globalize.translate('KidsViewBadgeAll', target.name) :
        globalize.translate('KidsViewBadgeSome', target.name);
}

async function fetchAccess() {
    fetchTimer = null;
    const ids = [ ...pending ];
    pending.clear();
    const client = apiClient();
    if (!ids.length || !client) return;

    for (let i = 0; i < ids.length; i += BATCH_SIZE) {
        const batch = ids.slice(i, i + BATCH_SIZE);
        try {
            const result = await client.getJSON(client.getUrl('Items/ProfileAccess', { ids: batch.join(',') }));
            profiles = result.Profiles || profiles;
            for (const [ itemId, visibleTo ] of Object.entries(result.Items || {})) {
                access.set(normalize(itemId), visibleTo.map(normalize));
            }
        } catch (err) {
            console.warn('[kidsView] unable to load profile access', err);
        }
    }

    for (const card of document.querySelectorAll('.card[data-id]')) decorate(card);
}

function queue(card) {
    const id = card.getAttribute('data-id');
    if (!id) return;
    if (access.has(normalize(id))) {
        decorate(card);
        return;
    }
    pending.add(id);
    if (!fetchTimer) fetchTimer = setTimeout(fetchAccess, 150);
}

function scan(root) {
    if (!target || !isAdministrator) return;
    const cards = root.matches?.('.card[data-id]') ? [ root ] : root.querySelectorAll?.('.card[data-id]') || [];
    for (const card of cards) queue(card);
}

function refreshAll() {
    for (const badge of document.querySelectorAll('.kidsViewBadge')) badge.remove();
    for (const button of document.querySelectorAll('.btnKidsView')) button.classList.toggle('kidsViewActive', !!target);
    scan(document.body);
}

/** The profile or level shown, or null when the kids view is off. */
export function getTarget() {
    return target;
}

/** Let the parent pick what the kids view shows. */
export async function chooseTarget(button) {
    if (!isAdministrator) isAdministrator = await checkAdministrator();
    return choose(button);
}

async function choose(button) {
    try {
        levels = await getProfileLevels(apiClient());
        if (!profiles.length) {
            const result = await apiClient().getJSON(apiClient().getUrl('Items/ProfileAccess', { ids: '' }));
            profiles = result.Profiles || [];
        }
    } catch (err) {
        console.warn('[kidsView] unable to load profiles', err);
    }

    const items = [ { name: globalize.translate('KidsViewOff'), id: 'off', selected: !target } ];
    for (const level of levels.filter(l => l.IsRestricted)) {
        items.push({
            name: globalize.translate('KidsViewLevel', level.Name),
            id: 'level:' + level.Id,
            selected: target?.type === 'level' && normalize(target.id) === normalize(level.Id)
        });
    }
    for (const profile of profiles) {
        items.push({
            name: profile.Name,
            id: 'user:' + profile.Id,
            selected: target?.type === 'user' && normalize(target.id) === normalize(profile.Id)
        });
    }

    const choice = await actionsheet.show({ items, positionTo: button, title: globalize.translate('HeaderKidsView') });
    if (choice === 'off') {
        target = null;
    } else if (choice.startsWith('level:')) {
        const level = levels.find(l => 'level:' + l.Id === choice);
        target = { type: 'level', id: level.Id, name: globalize.translate('KidsViewLevel', level.Name) };
    } else {
        const profile = profiles.find(p => 'user:' + p.Id === choice);
        target = { type: 'user', id: profile.Id, name: profile.Name };
    }
    saveTarget();
    refreshAll();
    document.dispatchEvent(new CustomEvent(KIDS_VIEW_CHANGED));
}

function addButtons(root) {
    if (!isAdministrator) return;
    const viewButtons = root.matches?.('.btnSelectView') ? [ root ] : root.querySelectorAll?.('.btnSelectView') || [];
    for (const viewButton of viewButtons) {
        if (viewButton.parentElement?.querySelector('.btnKidsView')) continue;
        const button = document.createElement('button', { is: 'paper-icon-button-light' });
        button.setAttribute('is', 'paper-icon-button-light');
        button.className = 'btnKidsView autoSize' + (target ? ' kidsViewActive' : '');
        button.title = globalize.translate('HeaderKidsView');
        button.innerHTML = '<span class="material-icons child_care" aria-hidden="true"></span>';
        button.addEventListener('click', e => {
            e.preventDefault();
            e.stopPropagation();
            choose(button).catch(() => {
                // menu closed
            });
        });
        viewButton.insertAdjacentElement('afterend', button);
    }
}

/** Forget what is known about an item, after it was added to or removed from profiles. */
export function invalidate(itemId) {
    access.delete(normalize(itemId));
    for (const card of document.querySelectorAll(`.card[data-id="${itemId}"]`)) queue(card);
}

/** The profiles and levels known, for item menus. */
export function getKnownProfiles() {
    return profiles;
}

async function start() {
    loadTarget();
    const observer = new MutationObserver(mutations => {
        // Check again whenever someone else is signed in
        const userId = apiClient()?.getCurrentUserId() || null;
        if (userId !== checkedUserId) {
            checkedUserId = userId;
            recheck();
            return;
        }
        if (!isAdministrator) return;
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (node.nodeType !== Node.ELEMENT_NODE) continue;
                addButtons(node);
                scan(node);
            }
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    // Whoever signs in decides: only administrators get the kids view
    async function recheck() {
        isAdministrator = await checkAdministrator();
        access.clear();
        if (isAdministrator) {
            addButtons(document.body);
            refreshAll();
        } else {
            for (const el of document.querySelectorAll('.kidsViewBadge')) el.remove();
        }
        document.dispatchEvent(new CustomEvent(KIDS_VIEW_CHANGED));
    }
    document.addEventListener('viewshow', () => {
        if (isAdministrator === null) recheck();
    });
    const Events = (await import('utils/events')).default;
    Events.on(ServerConnections, 'localusersignedin', recheck);
    Events.on(ServerConnections, 'localusersignedout', () => {
        isAdministrator = null;
        access.clear();
    });
    recheck();
}

start().catch(err => console.warn('[kidsView] failed to start', err));
