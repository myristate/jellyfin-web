import { useQuery } from '@tanstack/react-query';

import { useApi } from 'hooks/useApi';
import { queryClient } from 'utils/query/queryClient';

/** The number of problems reported and not fixed yet, shown in the dashboard drawer (Finly). */
export const OPEN_REPORT_COUNT_KEY = 'FinlyOpenItemReportCount';

export const useOpenReportCount = () => {
    const { __legacyApiClient__: apiClient, user } = useApi();

    return useQuery({
        queryKey: [ OPEN_REPORT_COUNT_KEY ],
        queryFn: async () => {
            const reports: unknown[] = await apiClient!.getJSON(apiClient!.getUrl('ItemReports', { includeResolved: false }));
            return reports.length;
        },
        enabled: !!apiClient && !!user?.Policy?.IsAdministrator,
        // Fetched once when the drawer shows, and again when a report is fixed or deleted
        staleTime: Infinity,
        refetchOnWindowFocus: false
    });
};

export const invalidateOpenReportCount = () => queryClient.invalidateQueries({ queryKey: [ OPEN_REPORT_COUNT_KEY ] });
