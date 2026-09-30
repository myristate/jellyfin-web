import React, { FunctionComponent, useCallback, useEffect, useMemo, useRef } from 'react';
import type { UserDto } from '@jellyfin/sdk/lib/generated-client';
import Dashboard from '../../../utils/dashboard';
import globalize from '../../../lib/globalize';
import confirm from '../../confirm/confirm';
import loading from '../../loading/loading';
import toast from '../../toast/toast';
import Button from '../../../elements/emby-button/Button';
import Input from '../../../elements/emby-input/Input';
import { QUERY_KEY as USER_QUERY_KEY } from '../../../hooks/api/useUser';
import { queryClient } from '../../../utils/query/queryClient';

type IProps = {
    user: UserDto
};

// Finly's server adds whether the user can sign in with a PIN from here
type UserWithPin = UserDto & { HasPin?: boolean };

const PIN_PATTERN = /^\d{4}$/;

const UserPasswordForm: FunctionComponent<IProps> = ({ user }: IProps) => {
    const element = useRef<HTMLDivElement>(null);
    const libraryMenu = useMemo(async () => ((await import('../../../scripts/libraryMenu')).default), []);

    const loadUser = useCallback(async () => {
        const page = element.current;

        if (!page) {
            console.error('[UserPasswordForm] Unexpected null page reference');
            return;
        }

        const loggedInUser = await Dashboard.getCurrentUser();

        if (!user.Policy || !user.Configuration) {
            throw new Error('Unexpected null user policy or configuration');
        }

        (await libraryMenu).setTitle(user.Name);

        const hasPin = (user as UserWithPin).HasPin === true;
        const isSelf = loggedInUser?.Id === user.Id;

        // Any user may do without a password, the server keeps one administrator with a password.
        // Resetting is for an administrator clearing someone else's password, not your own (Finly)
        (page.querySelector('#btnResetPassword') as HTMLDivElement).classList.toggle('hide', isSelf || !user.HasConfiguredPassword);
        (page.querySelector('#fldCurrentPassword') as HTMLDivElement).classList.toggle('hide', !user.HasPassword);

        const canChangePassword = loggedInUser?.Policy?.IsAdministrator || user.Policy.EnableUserPreferenceAccess;
        (page.querySelector('.passwordSection') as HTMLDivElement).classList.toggle('hide', !canChangePassword);
        (page.querySelector('.pinSection') as HTMLDivElement).classList.toggle('hide', !canChangePassword);

        (page.querySelector('.pinStatus') as HTMLDivElement).textContent = globalize.translate(hasPin ? 'PinStatusSet' : 'PinStatusNotSet');
        (page.querySelector('#btnRemovePin') as HTMLButtonElement).classList.toggle('hide', !hasPin);
        // Your own PIN needs your current password, an administrator can change anyone else's
        (page.querySelector('#fldPinCurrent') as HTMLDivElement).classList.toggle('hide', !(isSelf && user.HasPassword));
        (page.querySelector('#txtPinCurrent') as HTMLInputElement).value = '';
        (page.querySelector('#txtNewPin') as HTMLInputElement).value = '';
        (page.querySelector('#txtNewPinConfirm') as HTMLInputElement).value = '';

        import('../../autoFocuser').then(({ default: autoFocuser }) => {
            autoFocuser.autoFocus(page);
        }).catch(err => {
            console.error('[UserPasswordForm] failed to load autofocuser', err);
        });

        (page.querySelector('#txtCurrentPassword') as HTMLInputElement).value = '';
        (page.querySelector('#txtNewPassword') as HTMLInputElement).value = '';
        (page.querySelector('#txtNewPasswordConfirm') as HTMLInputElement).value = '';
    }, [user, libraryMenu]);

    useEffect(() => {
        const page = element.current;

        if (!page) {
            console.error('[UserPasswordForm] Unexpected null page reference');
            return;
        }

        loadUser().catch(err => {
            console.error('[UserPasswordForm] failed to load user', err);
        });

        const onSubmit = (e: Event) => {
            if ((page.querySelector('#txtNewPassword') as HTMLInputElement).value != (page.querySelector('#txtNewPasswordConfirm') as HTMLInputElement).value) {
                toast(globalize.translate('PasswordMatchError'));
            } else if ((page.querySelector('#txtNewPassword') as HTMLInputElement).value == '' && user?.Policy?.IsAdministrator) {
                toast(globalize.translate('PasswordMissingSaveError'));
            } else {
                loading.show();
                savePassword();
            }

            e.preventDefault();
            return false;
        };

        const savePassword = () => {
            if (!user.Id) {
                console.error('[UserPasswordForm.savePassword] missing user id');
                return;
            }

            let currentPassword = (page.querySelector('#txtCurrentPassword') as HTMLInputElement).value;
            const newPassword = (page.querySelector('#txtNewPassword') as HTMLInputElement).value;

            if ((page.querySelector('#fldCurrentPassword') as HTMLDivElement).classList.contains('hide')) {
                // Firefox does not respect autocomplete=off, so clear it if the field is supposed to be hidden (and blank)
                // This should only happen when user.HasConfiguredPassword is false, but this information is not passed on
                currentPassword = '';
            }

            window.ApiClient.updateUserPassword(user.Id, currentPassword, newPassword).then(function () {
                loading.hide();
                toast(globalize.translate('PasswordSaved'));
                refreshUser();
            }, function (response: Response) {
                loading.hide();
                showServerRefusal(response, 'HeaderLoginFailure', 'MessageInvalidUser');
            });
        };

        // The server explains refusals such as removing the last administrator password
        const showServerRefusal = (response: Response | undefined, titleKey: string, fallbackKey: string) => {
            const show = (message?: string) => Dashboard.alert({
                title: globalize.translate(titleKey),
                message: message || globalize.translate(fallbackKey)
            });

            if (response?.status === 400 && typeof response.text === 'function') {
                response.text().then(text => show(text), () => show());
            } else {
                show();
            }
        };

        const postPin = (body: { CurrentPw?: string, NewPin?: string, ResetPin?: boolean }) => window.ApiClient.ajax({
            type: 'POST',
            url: window.ApiClient.getUrl('Users/Pin', { userId: user.Id }),
            data: JSON.stringify(body),
            contentType: 'application/json'
        });

        const currentForPin = () => {
            const field = page.querySelector('#fldPinCurrent') as HTMLDivElement;
            return field.classList.contains('hide') ? '' : (page.querySelector('#txtPinCurrent') as HTMLInputElement).value;
        };

        const onSubmitPin = (e: Event) => {
            e.preventDefault();

            const newPin = (page.querySelector('#txtNewPin') as HTMLInputElement).value;
            if (!PIN_PATTERN.test(newPin)) {
                toast(globalize.translate('PinFormatError'));
                return;
            }
            if (newPin !== (page.querySelector('#txtNewPinConfirm') as HTMLInputElement).value) {
                toast(globalize.translate('PinMatchError'));
                return;
            }

            loading.show();
            postPin({ CurrentPw: currentForPin(), NewPin: newPin }).then(function () {
                loading.hide();
                toast(globalize.translate('PinSaved'));
                refreshUser();
            }, function (response: Response) {
                loading.hide();
                showServerRefusal(response, 'HeaderLoginFailure', 'MessageInvalidUser');
            });
        };

        const removePin = () => {
            confirm(globalize.translate('PinRemoveConfirmation'), globalize.translate('RemovePin')).then(function () {
                loading.show();
                postPin({ CurrentPw: currentForPin(), ResetPin: true }).then(function () {
                    loading.hide();
                    toast(globalize.translate('PinRemoved'));
                    refreshUser();
                }, function (response: Response) {
                    loading.hide();
                    showServerRefusal(response, 'HeaderLoginFailure', 'MessageInvalidUser');
                });
            }).catch(() => {
                // confirm dialog was closed
            });
        };

        // Fetch the user again so the page shows whether a password and PIN are set now
        const refreshUser = () => {
            queryClient.invalidateQueries({ queryKey: [ USER_QUERY_KEY ] }).catch(err => {
                console.error('[UserPasswordForm] failed to reload user', err);
            });
        };

        const resetPassword = () => {
            const msg = globalize.translate('PasswordResetConfirmation');
            confirm(msg, globalize.translate('ResetPassword')).then(function () {
                loading.show();
                if (user.Id) {
                    window.ApiClient.resetUserPassword(user.Id).then(function () {
                        loading.hide();
                        Dashboard.alert({
                            message: globalize.translate('PasswordResetComplete'),
                            title: globalize.translate('ResetPassword')
                        });
                        refreshUser();
                    }).catch((response: Response) => {
                        loading.hide();
                        showServerRefusal(response, 'ResetPassword', 'MessageInvalidUser');
                    });
                }
            }).catch(() => {
                // confirm dialog was closed
            });
        };

        (page.querySelector('.updatePasswordForm') as HTMLFormElement).addEventListener('submit', onSubmit);
        (page.querySelector('#btnResetPassword') as HTMLButtonElement).addEventListener('click', resetPassword);
        (page.querySelector('.updatePinForm') as HTMLFormElement).addEventListener('submit', onSubmitPin);
        (page.querySelector('#btnRemovePin') as HTMLButtonElement).addEventListener('click', removePin);

        return () => {
            (page.querySelector('.updatePasswordForm') as HTMLFormElement).removeEventListener('submit', onSubmit);
            (page.querySelector('#btnResetPassword') as HTMLButtonElement).removeEventListener('click', resetPassword);
            (page.querySelector('.updatePinForm') as HTMLFormElement).removeEventListener('submit', onSubmitPin);
            (page.querySelector('#btnRemovePin') as HTMLButtonElement).removeEventListener('click', removePin);
        };
    }, [loadUser, user]);

    return (
        <div ref={element}>
            <form
                className='updatePasswordForm passwordSection hide'
                style={{ margin: '0 auto 2em' }}
            >
                <div className='detailSection'>
                    <div id='fldCurrentPassword' className='inputContainer hide'>
                        <Input
                            type='password'
                            id='txtCurrentPassword'
                            label={globalize.translate('LabelCurrentPassword')}
                            autoComplete='off'
                        />
                    </div>
                    <div className='inputContainer'>
                        <Input
                            type='password'
                            id='txtNewPassword'
                            label={globalize.translate('LabelNewPassword')}
                            autoComplete='off'
                        />
                    </div>
                    <div className='inputContainer'>
                        <Input
                            type='password'
                            id='txtNewPasswordConfirm'
                            label={globalize.translate('LabelNewPasswordConfirm')}
                            autoComplete='off'
                        />
                    </div>
                    <br />
                    <div>
                        <Button
                            type='submit'
                            className='raised button-submit block'
                            title={globalize.translate('SavePassword')}
                        />
                        <Button
                            type='button'
                            id='btnResetPassword'
                            className='raised button-cancel block hide'
                            title={globalize.translate('ResetPassword')}
                        />
                    </div>
                </div>
            </form>
            <form
                className='updatePinForm pinSection hide'
                style={{ margin: '0 auto 2em' }}
            >
                <div className='detailSection'>
                    <h2 className='sectionTitle'>{globalize.translate('HeaderSignInPin')}</h2>
                    <div className='fieldDescription' style={{ marginBottom: '1em' }}>{globalize.translate('PinSignInHelp')}</div>
                    <div className='pinStatus' style={{ marginBottom: '1em' }} />
                    <div id='fldPinCurrent' className='inputContainer hide'>
                        <Input
                            type='password'
                            id='txtPinCurrent'
                            label={globalize.translate('LabelCurrentPassword')}
                            autoComplete='off'
                        />
                    </div>
                    <div className='inputContainer'>
                        <Input
                            type='password'
                            id='txtNewPin'
                            label={globalize.translate('LabelNewPin')}
                            autoComplete='off'
                            inputMode='numeric'
                            maxLength={4}
                        />
                    </div>
                    <div className='inputContainer'>
                        <Input
                            type='password'
                            id='txtNewPinConfirm'
                            label={globalize.translate('LabelNewPinConfirm')}
                            autoComplete='off'
                            inputMode='numeric'
                            maxLength={4}
                        />
                    </div>
                    <br />
                    <div>
                        <Button
                            type='submit'
                            className='raised button-submit block'
                            title={globalize.translate('SavePin')}
                        />
                        <Button
                            type='button'
                            id='btnRemovePin'
                            className='raised button-cancel block hide'
                            title={globalize.translate('RemovePin')}
                        />
                    </div>
                </div>
            </form>
        </div>
    );
};

export default UserPasswordForm;
