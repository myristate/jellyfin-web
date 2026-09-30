import createDOMPurify from 'dompurify';
import escapeHtml from 'escape-html';
import markdownIt from 'markdown-it';

import { AppFeature } from 'constants/appFeature';
import { ServerConnections } from 'lib/jellyfin-apiclient';

import { appHost } from 'components/apphost';
import appSettings from 'scripts/settings/appSettings';
import dom from 'utils/dom';
import loading from 'components/loading/loading';
import layoutManager from 'components/layoutManager';
import libraryMenu from 'scripts/libraryMenu';
import browser from 'scripts/browser';
import inputManager from 'scripts/inputManager';
import { getKeyName } from 'scripts/keyboardNavigation';
import globalize from 'lib/globalize';
import 'components/cardbuilder/card.scss';
import 'elements/emby-checkbox/emby-checkbox';
import Dashboard from 'utils/dashboard';
import toast from 'components/toast/toast';
import dialogHelper from 'components/dialogHelper/dialogHelper';
import baseAlert from 'components/alert';
import { getDefaultBackgroundClass } from 'components/cardbuilder/utils/builder';

import './login.scss';

const domPurify = createDOMPurify();
domPurify.setConfig({
    // eslint-disable-next-line @typescript-eslint/naming-convention, sonarjs/regex-complexity -- DOMPurify config option; customizes its default regex
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel|callto|cid|xmpp|matrix|tg|whatsapp|signal|ircs?):|[^a-z]|[a-z+.-]+(?:[^-a-z+.:]|$))/i
});

const enableFocusTransform = !browser.slow && !browser.edge;

function authenticateUserByName(page, apiClient, url, username, password, isPin) {
    loading.show();
    return apiClient.authenticateUserByName(username, password).then(function (result) {
        const user = result.User;
        loading.hide();

        onLoginSuccessful(user.Id, result.AccessToken, apiClient, url);
    }, function (response) {
        page.querySelector('#txtManualPassword').value = '';
        loading.hide();

        if (isPin) {
            onPinFailed(page, response);
            return;
        }

        const UnauthorizedOrForbidden = [401, 403];
        if (UnauthorizedOrForbidden.includes(response.status)) {
            const messageKey = response.status === 401 ? 'MessageInvalidUser' : 'MessageUnauthorizedUser';
            toast(globalize.translate(messageKey));
        } else {
            Dashboard.alert({
                message: globalize.translate('MessageUnableToConnectToServer'),
                title: globalize.translate('HeaderConnectionFailure')
            });
        }
    });
}

function authenticateQuickConnect(apiClient, targetUrl) {
    const url = apiClient.getUrl('/QuickConnect/Initiate');
    apiClient.ajax({ type: 'POST', url }, true).then(res => res.json()).then(function (json) {
        if (!json.Secret || !json.Code) {
            console.error('Malformed quick connect response', json);
            return false;
        }

        baseAlert({
            dialogOptions: {
                id: 'quickConnectAlert'
            },
            title: globalize.translate('QuickConnect'),
            text: globalize.translate('QuickConnectAuthorizeCode', json.Code)
        });

        const connectUrl = apiClient.getUrl('/QuickConnect/Connect?Secret=' + json.Secret);

        const interval = setInterval(function() {
            apiClient.getJSON(connectUrl).then(async function(data) {
                if (!data.Authenticated) {
                    return;
                }

                clearInterval(interval);

                // Close the QuickConnect dialog
                const dlg = document.getElementById('quickConnectAlert');
                if (dlg) {
                    dialogHelper.close(dlg);
                }

                const result = await apiClient.quickConnect(data.Secret);
                onLoginSuccessful(result.User.Id, result.AccessToken, apiClient, targetUrl);
            }, function (e) {
                clearInterval(interval);

                // Close the QuickConnect dialog
                const dlg = document.getElementById('quickConnectAlert');
                if (dlg) {
                    dialogHelper.close(dlg);
                }

                Dashboard.alert({
                    message: globalize.translate('QuickConnectDeactivated'),
                    title: globalize.translate('HeaderError')
                });

                console.error('Unable to login with quick connect', e);
            });
        }, 5000, connectUrl);

        return true;
    }, function(e) {
        Dashboard.alert({
            message: globalize.translate('QuickConnectNotActive'),
            title: globalize.translate('HeaderError')
        });

        console.error('Quick connect error: ', e);
        return false;
    });
}

/** On TV the PIN pad takes the focus, focusing the field would bring up the on-screen keyboard (Finly). */
function focusPin(context) {
    if (layoutManager.tv) {
        context.querySelector('.pinKey')?.focus();
    } else {
        context.querySelector('#txtPin').focus();
    }
}

function onPinFailed(page, response) {
    const pinInput = page.querySelector('#txtPin');
    pinInput.value = '';
    focusPin(page);

    if (response.status === 401) {
        toast(globalize.translate('MessageWrongPin'));
    } else if (response.status === 403 && typeof response.text === 'function') {
        // For example too many wrong PINs, the server says how long to wait
        response.text().then(function (text) {
            toast(text ? text.replace(/^\[[^\]]*\]\s*/, '') : globalize.translate('MessageUnauthorizedUser'));
        });
    } else {
        Dashboard.alert({
            message: globalize.translate('MessageUnableToConnectToServer'),
            title: globalize.translate('HeaderConnectionFailure')
        });
    }
}

function showPinForm(context, username, hasPassword) {
    context.querySelector('.pinLoginForm').classList.remove('hide');
    context.querySelector('.visualLoginForm').classList.add('hide');
    context.querySelector('.manualLoginForm').classList.add('hide');
    context.querySelector('.btnManual').classList.add('hide');
    context.querySelector('.pinTitle').textContent = globalize.translate('EnterPinFor', username);
    context.querySelector('.btnUsePassword').classList.toggle('hide', !hasPassword);

    const pinInput = context.querySelector('#txtPin');
    pinInput.value = '';
    pinInput.setAttribute('data-username', username);
    // The pad is the way in on TV, keep the field from opening the on-screen keyboard
    pinInput.readOnly = layoutManager.tv;
    pinInput.tabIndex = layoutManager.tv ? -1 : 0;
    focusPin(context);
}

function onLoginSuccessful(id, accessToken, apiClient, url) {
    Dashboard.onServerChanged(id, accessToken, apiClient);
    Dashboard.navigate(url || 'home');
}

function showManualForm(context, showCancel, focusPassword) {
    context.querySelector('.chkRememberLogin').checked = appSettings.enableAutoLogin();
    context.querySelector('.manualLoginForm').classList.remove('hide');
    context.querySelector('.visualLoginForm').classList.add('hide');
    context.querySelector('.pinLoginForm').classList.add('hide');
    context.querySelector('.btnManual').classList.add('hide');

    if (focusPassword) {
        context.querySelector('#txtManualPassword').focus();
    } else {
        context.querySelector('#txtManualName').focus();
    }

    if (showCancel) {
        context.querySelector('.btnCancel').classList.remove('hide');
    } else {
        context.querySelector('.btnCancel').classList.add('hide');
    }
}

function loadUserList(context, apiClient, users) {
    let html = '';

    for (const user of users) {
        // TODO move card creation code to Card component
        let cssClass = 'card squareCard scalableCard squareCard-scalable';

        if (layoutManager.tv) {
            cssClass += ' show-focus';

            if (enableFocusTransform) {
                cssClass += ' show-animation';
            }
        }

        const cardBoxCssClass = 'cardBox cardBox-bottompadded';
        html += '<button type="button" class="' + cssClass + '">';
        html += '<div class="' + cardBoxCssClass + '">';
        html += '<div class="cardScalable">';
        html += '<div class="cardPadder cardPadder-square"></div>';
        html += `<div class="cardContent" data-haspw="${user.HasPassword}" data-haspin="${user.HasPin === true}" data-hasconfiguredpw="${user.HasConfiguredPassword}" data-username="${escapeHtml(user.Name)}" data-userid="${escapeHtml(user.Id)}">`;
        let imgUrl;

        if (user.PrimaryImageTag) {
            imgUrl = apiClient.getUserImageUrl(user.Id, {
                width: 300,
                tag: user.PrimaryImageTag,
                type: 'Primary'
            });

            html += '<div class="cardImageContainer coveredImage" style="background-image:url(\'' + imgUrl + "');\"></div>";
        } else {
            html += `<div class="cardImage flex align-items-center justify-content-center ${getDefaultBackgroundClass()}">`;
            html += '<span class="material-icons cardImageIcon person" aria-hidden="true"></span>';
            html += '</div>';
        }

        html += '</div>';
        html += '</div>';
        html += '<div class="cardFooter visualCardBox-cardFooter">';
        html += '<div class="cardText singleCardText cardTextCentered">' + escapeHtml(user.Name) + '</div>';
        html += '</div>';
        html += '</div>';
        html += '</button>';
    }

    context.querySelector('#divUsers').innerHTML = html;
}

export default function (view, params) {
    function getApiClient() {
        const serverId = params.serverid;

        if (serverId) {
            return ServerConnections.getOrCreateApiClient(serverId);
        }

        return ApiClient;
    }

    function getTargetUrl() {
        if (params.url) {
            try {
                return decodeURIComponent(params.url);
            } catch (err) {
                console.warn('[LoginPage] unable to decode url param', params.url, err);
            }
        }

        return '/home';
    }

    function showVisualForm() {
        view.querySelector('.visualLoginForm').classList.remove('hide');
        view.querySelector('.manualLoginForm').classList.add('hide');
        view.querySelector('.pinLoginForm').classList.add('hide');
        view.querySelector('.btnManual').classList.remove('hide');

        import('components/autoFocuser').then(({ default: autoFocuser }) => {
            autoFocuser.autoFocus(view);
        });
    }

    view.querySelector('#divUsers').addEventListener('click', function (e) {
        const card = dom.parentWithClass(e.target, 'card');
        const cardContent = card ? card.querySelector('.cardContent') : null;

        if (cardContent) {
            const context = view;
            const id = cardContent.getAttribute('data-userid');
            const name = cardContent.getAttribute('data-username');
            const haspw = cardContent.getAttribute('data-haspw');
            const haspin = cardContent.getAttribute('data-haspin');

            if (id === 'manual') {
                context.querySelector('#txtManualName').value = '';
                showManualForm(context, true);
            } else if (haspin == 'true') {
                showPinForm(context, name, cardContent.getAttribute('data-hasconfiguredpw') == 'true');
            } else if (haspw == 'false') {
                authenticateUserByName(context, getApiClient(), getTargetUrl(), name, '');
            } else {
                context.querySelector('#txtManualName').value = name;
                context.querySelector('#txtManualPassword').value = '';
                showManualForm(context, true, true);
            }
        }
    });
    view.querySelector('.manualLoginForm').addEventListener('submit', function (e) {
        appSettings.enableAutoLogin(view.querySelector('.chkRememberLogin').checked);
        authenticateUserByName(view, getApiClient(), getTargetUrl(), view.querySelector('#txtManualName').value, view.querySelector('#txtManualPassword').value);
        e.preventDefault();
        return false;
    });
    const pinForm = view.querySelector('.pinLoginForm');
    const pinInput = view.querySelector('#txtPin');
    // Presses are ignored while a PIN is being checked, so a fifth digit can't start a second sign in (Finly)
    let pinInFlight = false;
    const setPinInFlight = function (inFlight) {
        pinInFlight = inFlight;
        pinForm.classList.toggle('pinLoginForm-busy', inFlight);
        view.querySelector('.pinPad').setAttribute('aria-busy', String(inFlight));
        pinInput.readOnly = inFlight || layoutManager.tv;
    };
    const submitPinWhenComplete = function () {
        pinInput.value = pinInput.value.replace(/\D/g, '').slice(0, 4);
        if (pinInput.value.length === 4 && !pinInFlight) {
            setPinInFlight(true);
            authenticateUserByName(view, getApiClient(), getTargetUrl(), pinInput.getAttribute('data-username'), pinInput.value, true)
                .finally(function () {
                    setPinInFlight(false);
                });
        }
    };
    const pressPinKey = function (digit) {
        if (pinInFlight) {
            return;
        }

        if (digit == null) {
            pinInput.value = pinInput.value.slice(0, -1);
        } else {
            pinInput.value += digit;
            submitPinWhenComplete();
        }
    };
    const closePinForm = function () {
        if (!pinInFlight) {
            showVisualForm();
        }
    };
    pinInput.addEventListener('input', submitPinWhenComplete);
    view.querySelector('.pinPad').addEventListener('click', function (e) {
        const key = dom.parentWithClass(e.target, 'pinKey');
        if (!key) {
            return;
        }

        pressPinKey(key.classList.contains('pinDelete') ? null : key.getAttribute('data-digit'));
    });
    // A keyboard or remote can type the PIN wherever the focus is on the pad, and Back closes the pad rather than
    // leaving the page
    pinForm.addEventListener('keydown', function (e) {
        if (e.ctrlKey || e.altKey || e.metaKey) {
            return;
        }

        const key = getKeyName(e);
        if (key === 'Back' || key === 'Escape' || e.key === 'GoBack' || e.key === 'BrowserBack') {
            e.preventDefault();
            e.stopPropagation();
            closePinForm();
            return;
        }

        // The field handles typing itself when it has the focus
        if (e.target === pinInput && !pinInput.readOnly) {
            return;
        }

        if (/^\d$/.test(e.key)) {
            e.preventDefault();
            pressPinKey(e.key);
        } else if (e.key === 'Backspace') {
            e.preventDefault();
            pressPinKey(null);
        }
    });
    // Back from elsewhere, such as an app's own back button
    const onCommand = function (e) {
        if (e.detail.command === 'back' && !pinForm.classList.contains('hide')) {
            e.preventDefault();
            closePinForm();
        }
    };
    pinForm.addEventListener('submit', function (e) {
        e.preventDefault();
        return false;
    });
    view.querySelector('.btnUsePassword').addEventListener('click', function () {
        view.querySelector('#txtManualName').value = pinInput.getAttribute('data-username');
        view.querySelector('#txtManualPassword').value = '';
        showManualForm(view, true, true);
    });
    view.querySelector('.btnPinCancel').addEventListener('click', closePinForm);
    view.querySelector('.btnForgotPassword').addEventListener('click', function () {
        Dashboard.navigate('forgotpassword');
    });
    view.querySelector('.btnCancel').addEventListener('click', showVisualForm);
    view.querySelector('.btnQuick').addEventListener('click', function () {
        authenticateQuickConnect(getApiClient(), getTargetUrl());
        return false;
    });
    view.querySelector('.btnManual').addEventListener('click', function () {
        view.querySelector('#txtManualName').value = '';
        showManualForm(view, true);
    });
    view.querySelector('.btnSelectServer').addEventListener('click', function () {
        Dashboard.selectServer();
    });

    view.addEventListener('viewshow', function () {
        loading.show();
        libraryMenu.setTransparentMenu(true);
        inputManager.on(view, onCommand);

        if (!appHost.supports(AppFeature.MultiServer)) {
            view.querySelector('.btnSelectServer').classList.add('hide');
        }

        const apiClient = getApiClient();

        apiClient.getQuickConnect('Enabled')
            .then(enabled => {
                if (enabled === true) {
                    view.querySelector('.btnQuick').classList.remove('hide');
                }
            })
            .catch(() => {
                console.debug('Failed to get QuickConnect status');
            });

        apiClient.getPublicUsers().then(function (users) {
            if (users.length) {
                // The list can arrive after a profile was already picked, don't close its PIN pad
                if (view.querySelector('.pinLoginForm').classList.contains('hide')) {
                    showVisualForm();
                }
                loadUserList(view, apiClient, users);
            } else {
                view.querySelector('#txtManualName').value = '';
                showManualForm(view, false, false);
            }
        }).catch().then(function () {
            loading.hide();
        });
        apiClient.getJSON(apiClient.getUrl('Branding/Configuration')).then(function (options) {
            const loginDisclaimer = view.querySelector('.loginDisclaimer');

            // eslint-disable-next-line sonarjs/disabled-auto-escaping
            loginDisclaimer.innerHTML = domPurify.sanitize(markdownIt({ html: true }).render(options.LoginDisclaimer || ''));

            for (const elem of loginDisclaimer.querySelectorAll('a')) {
                elem.rel = 'noopener noreferrer';
                elem.target = '_blank';
                elem.classList.add('button-link');
                elem.setAttribute('is', 'emby-linkbutton');

                if (layoutManager.tv) {
                    // Disable links navigation on TV
                    elem.tabIndex = -1;
                }
            }
        });
    });
    view.addEventListener('viewhide', function () {
        libraryMenu.setTransparentMenu(false);
        inputManager.off(view, onCommand);
    });
}

