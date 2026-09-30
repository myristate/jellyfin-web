import * as userSettings from 'scripts/settings/userSettings';

import { LibraryRoutes } from '../constants/libraryRoutes';

/**
 * Utility function to check if a path is a details path.
 */
export const isDetailsPath = (path: string) => (
    path === '/details'
);

/**
 * Utility function to check if a path is a library path.
 */
export const isLibraryPath = (path: string) => (
    LibraryRoutes.some(route => route.path === path)
);

/**
 * Utility function to get the default view index for a specified URL path and library.
 */
export const getDefaultViewIndex = (path: string, libraryId?: string | null) => {
    const views = LibraryRoutes.find(route => route.path === path)?.views ?? [];
    // Pages opened without a library id (such as the TV page) still get their default view
    if (!libraryId) return views.find(view => view.isDefault)?.index ?? 0;

    const defaultView = userSettings.get('landing-' + libraryId, false);

    return views.find(view => view.view === defaultView)?.index
        ?? views.find(view => view.isDefault)?.index
        ?? 0;
};
