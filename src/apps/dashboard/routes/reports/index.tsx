import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import FormControlLabel from '@mui/material/FormControlLabel';
import Link from '@mui/material/Link';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import Typography from '@mui/material/Typography';
import React, { useCallback, useEffect, useState } from 'react';

import { invalidateOpenReportCount } from 'apps/dashboard/features/reports/api/useOpenReportCount';
import Loading from 'components/loading/LoadingComponent';
import Page from 'components/Page';
import globalize from 'lib/globalize';

/** A problem someone reported with a film or episode (Finly). */
type ItemReport = {
    Id: string;
    ItemId: string;
    ItemName: string;
    UserName: string;
    /** Video, Audio, WrongLanguage, Subtitles or Other, a newer server may send others. */
    Problem: string;
    Note?: string | null;
    DateCreated: string;
    IsResolved: boolean;
    DateResolved?: string | null;
};

const PROBLEM_LABELS: Record<string, string> = {
    Video: 'ReportProblemVideo',
    Audio: 'ReportProblemAudio',
    WrongLanguage: 'ReportProblemWrongLanguage',
    Subtitles: 'ReportProblemSubtitles',
    Other: 'ReportProblemOther'
};

const problemLabel = (problem: string) => globalize.translate(PROBLEM_LABELS[problem] ?? 'ReportProblemOther');

const formatDate = (date: string) => new Date(date).toLocaleString(
    globalize.getCurrentDateTimeLocale() || undefined,
    { dateStyle: 'medium', timeStyle: 'short' }
);

type ReportCardProps = {
    report: ItemReport;
    onChanged: () => void;
    onError: (message: string) => void;
};

const ReportCard = ({ report, onChanged, onError }: ReportCardProps) => {
    const [ isBusy, setIsBusy ] = useState(false);
    const [ isConfirmingDelete, setIsConfirmingDelete ] = useState(false);

    const onResolve = useCallback(() => {
        setIsBusy(true);
        window.ApiClient.ajax({
            type: 'POST',
            url: window.ApiClient.getUrl(`ItemReports/${report.Id}/Resolve`, { resolved: !report.IsResolved })
        }).then(onChanged).catch(err => {
            console.error('[ItemReports] failed to update report', err);
            onError(globalize.translate('ItemReportUpdateFailed'));
        }).finally(() => setIsBusy(false));
    }, [ report, onChanged, onError ]);

    const onDeleteClick = useCallback(() => setIsConfirmingDelete(true), []);
    const onDeleteCancel = useCallback(() => setIsConfirmingDelete(false), []);

    const onDeleteConfirm = useCallback(() => {
        setIsBusy(true);
        window.ApiClient.ajax({
            type: 'DELETE',
            url: window.ApiClient.getUrl(`ItemReports/${report.Id}`)
        }).then(onChanged).catch(err => {
            console.error('[ItemReports] failed to delete report', err);
            onError(globalize.translate('ItemReportDeleteFailed'));
            setIsConfirmingDelete(false);
        }).finally(() => setIsBusy(false));
    }, [ report, onChanged, onError ]);

    return (
        <Paper className='itemReport' sx={{ p: 2, opacity: report.IsResolved ? 0.6 : 1 }}>
            <Stack spacing={1}>
                <Stack direction='row' spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
                    <Link href={`#/details?id=${report.ItemId}`} variant='h6' underline='hover'>{report.ItemName}</Link>
                    <Chip size='small' color={report.IsResolved ? 'default' : 'warning'} label={problemLabel(report.Problem)} />
                </Stack>
                {report.Note && <Typography sx={{ whiteSpace: 'pre-wrap' }}>{report.Note}</Typography>}
                <Typography variant='body2' color='text.secondary'>
                    {globalize.translate('ItemReportBy', report.UserName, formatDate(report.DateCreated))}
                    {report.IsResolved && report.DateResolved && ` · ${globalize.translate('ItemReportResolved', formatDate(report.DateResolved))}`}
                </Typography>
                {isConfirmingDelete ? (
                    <Alert
                        severity='warning'
                        action={
                            <Stack direction='row' spacing={1}>
                                <Button color='error' variant='contained' size='small' disabled={isBusy} onClick={onDeleteConfirm}>
                                    {globalize.translate('Delete')}
                                </Button>
                                <Button color='inherit' size='small' disabled={isBusy} onClick={onDeleteCancel}>
                                    {globalize.translate('ButtonCancel')}
                                </Button>
                            </Stack>
                        }
                    >
                        {globalize.translate('ItemReportDeleteConfirm')}
                    </Alert>
                ) : (
                    <Stack direction='row' spacing={1}>
                        <Button
                            className='btnResolveReport'
                            variant={report.IsResolved ? 'text' : 'contained'}
                            disabled={isBusy}
                            onClick={onResolve}
                        >
                            {globalize.translate(report.IsResolved ? 'ButtonReopen' : 'ButtonMarkResolved')}
                        </Button>
                        <Button className='btnDeleteReport' color='error' disabled={isBusy} onClick={onDeleteClick}>
                            {globalize.translate('Delete')}
                        </Button>
                    </Stack>
                )}
            </Stack>
        </Paper>
    );
};

export const Component = () => {
    const [ reports, setReports ] = useState<ItemReport[]>();
    const [ showResolved, setShowResolved ] = useState(false);
    const [ error, setError ] = useState<string>();

    const load = useCallback(() => {
        window.ApiClient.getJSON(window.ApiClient.getUrl('ItemReports', { includeResolved: showResolved }))
            .then((loaded: ItemReport[]) => {
                setReports(loaded);
                setError(undefined);
            })
            .catch(err => {
                console.error('[ItemReports] failed to load', err);
                setReports([]);
                setError(globalize.translate('ItemReportsLoadFailed'));
            });
    }, [ showResolved ]);

    useEffect(load, [ load ]);

    const onChanged = useCallback(() => {
        load();
        // The drawer shows how many are still open
        invalidateOpenReportCount().catch(err => {
            console.error('[ItemReports] failed to refresh the open count', err);
        });
    }, [ load ]);

    const onShowResolvedChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => setShowResolved(e.target.checked), []);
    const onErrorClose = useCallback(() => setError(undefined), []);

    if (!reports) return <Loading />;

    return (
        <Page
            id='itemReportsPage'
            title={globalize.translate('HeaderItemReports')}
            className='mainAnimatedPage type-interior'
        >
            <Box className='content-primary'>
                <Stack spacing={3}>
                    <Typography variant='h1'>{globalize.translate('HeaderItemReports')}</Typography>
                    <FormControlLabel
                        control={<Switch checked={showResolved} onChange={onShowResolvedChange} />}
                        label={globalize.translate('LabelShowResolved')}
                    />
                    {error && <Alert severity='error' onClose={onErrorClose}>{error}</Alert>}
                    {reports.length === 0 && !error && <Alert severity='success'>{globalize.translate('ItemReportsNone')}</Alert>}
                    {reports.map(report => (
                        <ReportCard key={report.Id} report={report} onChanged={onChanged} onError={setError} />
                    ))}
                </Stack>
            </Box>
        </Page>
    );
};

Component.displayName = 'ItemReportsPage';
