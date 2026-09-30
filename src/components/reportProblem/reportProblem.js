import dialogHelper from '../dialogHelper/dialogHelper';
import layoutManager from '../layoutManager';
import loading from '../loading/loading';
import toast from '../toast/toast';
import scrollHelper from '../../scripts/scrollHelper';
import globalize from '../../lib/globalize';
import dom from '../../utils/dom';
import 'material-design-icons-iconfont';
import '../../elements/emby-button/emby-button';
import '../../elements/emby-button/paper-icon-button-light';
import '../../elements/emby-select/emby-select';
import '../../elements/emby-textarea/emby-textarea';
import '../formdialog.scss';
import template from './reportProblem.template.html';

/** Item types that play from a file, so something can be wrong with them. */
const REPORTABLE_TYPES = ['Movie', 'Episode', 'Video', 'MusicVideo'];

/** Whether a problem can be reported with an item (Finly). */
export function canReport(item) {
    return REPORTABLE_TYPES.includes(item.Type) && item.LocationType !== 'Virtual';
}

/** The server limits how many reports a profile sends in an hour, and refuses a problem it doesn't know. */
function getFailureKey(response) {
    switch (response?.status) {
        case 429:
            return 'ReportTooMany';
        case 400:
            return 'ReportRejected';
        default:
            return 'ReportFailed';
    }
}

function itemName(item) {
    if (item.Type === 'Episode' && item.SeriesName) {
        return `${item.SeriesName} S${item.ParentIndexNumber ?? 0}:E${item.IndexNumber ?? 0} ${item.Name}`;
    }
    return item.ProductionYear ? `${item.Name} (${item.ProductionYear})` : item.Name;
}

/**
 * Asks what is wrong with a film or episode, such as a corrupted picture or the wrong language, and sends the report
 * to the server for an administrator to look at (Finly).
 */
export function showReportProblem(apiClient, item) {
    const dialogOptions = {
        removeOnClose: true,
        scrollY: false
    };
    if (layoutManager.tv) dialogOptions.size = 'fullscreen';

    const dlg = dialogHelper.createDialog(dialogOptions);
    dlg.classList.add('formDialog', 'reportProblemDialog');
    dlg.innerHTML = globalize.translateHtml(template, 'core');

    if (layoutManager.tv) {
        scrollHelper.centerFocus.on(dlg.querySelector('.formDialogContent'), false);
    } else {
        dlg.querySelector('.dialogContentInner').classList.add('dialogContentInner-mini');
        dlg.classList.add('dialog-fullscreen-lowres');
    }
    dlg.style.minWidth = `${Math.min(400, dom.getWindowSize().innerWidth - 50)}px`;
    dlg.querySelector('.reportProblemItemName').innerText = itemName(item);

    dlg.querySelector('.btnCancel').addEventListener('click', () => dialogHelper.close(dlg));

    let sent = false;
    let sending = false;
    const btnSubmit = dlg.querySelector('.btnSubmit');
    const sendReport = () => {
        sending = true;
        btnSubmit.disabled = true;

        loading.show();
        apiClient.ajax({
            type: 'POST',
            url: apiClient.getUrl(`Items/${item.Id}/Reports`),
            data: JSON.stringify({
                Problem: dlg.querySelector('#selectProblem').value,
                Note: dlg.querySelector('#txtReportNote').value
            }),
            contentType: 'application/json'
        }).then(() => {
            sent = true;
            toast(globalize.translate('ReportSent'));
            dialogHelper.close(dlg);
        }).catch(response => {
            toast(globalize.translate(getFailureKey(response)));
        }).finally(() => {
            sending = false;
            btnSubmit.disabled = false;
            loading.hide();
        });
    };

    dlg.querySelector('form').addEventListener('submit', e => {
        e.preventDefault();
        e.stopPropagation();

        // Send one report, however often the button is pressed while it's sending
        if (!sending) sendReport();
        return false;
    });

    return dialogHelper.open(dlg).then(() => {
        if (layoutManager.tv) scrollHelper.centerFocus.off(dlg.querySelector('.formDialogContent'), false);
        return sent;
    });
}
