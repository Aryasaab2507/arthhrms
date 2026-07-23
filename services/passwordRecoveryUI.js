// Reusable password recovery form. Password values remain in DOM controls only.
(function (global) {
    'use strict';

    const REQUIREMENTS = Object.freeze([
        Object.freeze({ key: 'minimumLength', label: 'At least 12 characters' }),
        Object.freeze({ key: 'uppercase', label: 'One uppercase letter' }),
        Object.freeze({ key: 'lowercase', label: 'One lowercase letter' }),
        Object.freeze({ key: 'number', label: 'One number' }),
        Object.freeze({ key: 'specialCharacter', label: 'One special character' })
    ]);

    function evaluate(password) {
        if (global.authInviteService?.evaluateRecoveryPassword) {
            return global.authInviteService.evaluateRecoveryPassword(password);
        }
        const value = String(password || '');
        const checks = Object.freeze({
            minimumLength: value.length >= 12,
            uppercase: /[A-Z]/.test(value),
            lowercase: /[a-z]/.test(value),
            number: /[0-9]/.test(value),
            specialCharacter: /[^A-Za-z0-9\s]/.test(value)
        });
        const score = Object.values(checks).filter(Boolean).length;
        return { valid: score === 5, score, maximumScore: 5, checks };
    }

    function node(tagName, className, text) {
        const element = global.document.createElement(tagName);
        if (className) element.className = className;
        if (text !== undefined) element.textContent = text;
        return element;
    }

    function mountRequest(options = {}) {
        const container = typeof options.container === 'string'
            ? global.document.querySelector(options.container)
            : options.container;
        if (!container) throw new Error('Password recovery request container is required.');
        if (typeof options.onSubmit !== 'function') throw new Error('Password recovery request handler is required.');

        const form = node('form', 'recovery-request-form');
        form.noValidate = true;

        const emailGroup = node('div', 'field');
        const emailLabel = node('label', '', 'Account Email');
        emailLabel.htmlFor = 'recoveryEmail';
        const email = node('input', 'input');
        email.id = 'recoveryEmail';
        email.name = 'email';
        email.type = 'email';
        email.inputMode = 'email';
        email.autocomplete = 'email';
        email.required = true;
        email.maxLength = 254;
        emailGroup.append(emailLabel, email);

        const guidance = node(
            'p',
            'recovery-guidance',
            'We will send a secure, single-use password recovery link if this email belongs to an active account.'
        );
        const feedback = node('div', 'form-feedback');
        feedback.setAttribute('role', 'status');
        feedback.setAttribute('aria-live', 'polite');

        const submit = node('button', 'btn recovery-submit', 'Send Recovery Link');
        submit.type = 'submit';

        form.append(emailGroup, guidance, feedback, submit);
        container.replaceChildren(form);

        form.addEventListener('submit', async (event) => {
            event.preventDefault();
            feedback.textContent = '';
            feedback.className = 'form-feedback';
            if (!form.checkValidity()) {
                form.reportValidity();
                return;
            }

            submit.disabled = true;
            submit.textContent = 'Sending...';
            try {
                const result = await options.onSubmit(email.value.trim());
                if (!result?.ok) {
                    feedback.textContent = result?.message || 'The recovery request could not be started. Try again.';
                    feedback.className = 'form-feedback err';
                    submit.disabled = false;
                    submit.textContent = 'Send Recovery Link';
                    options.onError?.(result);
                    return;
                }

                email.disabled = true;
                submit.textContent = 'Recovery Email Sent';
                feedback.textContent = result.message;
                feedback.className = 'form-feedback ok';
                options.onSuccess?.(result);
            } catch (_error) {
                feedback.textContent = 'We could not connect to the authentication service. Check your connection and try again.';
                feedback.className = 'form-feedback err';
                submit.disabled = false;
                submit.textContent = 'Send Recovery Link';
                options.onError?.({ code: 'RECOVERY_NETWORK_ERROR' });
            }
        });

        return Object.freeze({ form, email, submit });
    }

    function mount(options = {}) {
        const container = typeof options.container === 'string'
            ? global.document.querySelector(options.container)
            : options.container;
        if (!container) throw new Error('Password recovery container is required.');
        if (typeof options.onSubmit !== 'function') throw new Error('Password recovery submit handler is required.');

        const form = node('form', 'recovery-form');
        form.noValidate = true;

        const newPasswordGroup = node('div', 'field');
        const newPasswordLabel = node('label', '', 'New Password');
        newPasswordLabel.htmlFor = 'recoveryNewPassword';
        const newPassword = node('input', 'input');
        newPassword.id = 'recoveryNewPassword';
        newPassword.name = 'newPassword';
        newPassword.type = 'password';
        newPassword.autocomplete = 'new-password';
        newPassword.minLength = 12;
        newPassword.maxLength = 128;
        newPassword.required = true;
        newPassword.setAttribute('aria-describedby', 'passwordRequirements passwordStrength');
        newPasswordGroup.append(newPasswordLabel, newPassword);

        const confirmGroup = node('div', 'field');
        const confirmLabel = node('label', '', 'Confirm Password');
        confirmLabel.htmlFor = 'recoveryConfirmPassword';
        const confirmPassword = node('input', 'input');
        confirmPassword.id = 'recoveryConfirmPassword';
        confirmPassword.name = 'confirmPassword';
        confirmPassword.type = 'password';
        confirmPassword.autocomplete = 'new-password';
        confirmPassword.minLength = 12;
        confirmPassword.maxLength = 128;
        confirmPassword.required = true;
        confirmPassword.setAttribute('aria-describedby', 'passwordMatch');
        confirmGroup.append(confirmLabel, confirmPassword);

        const strength = node('div', 'strength');
        strength.id = 'passwordStrength';
        const strengthHeader = node('div', 'strength-head');
        const strengthTitle = node('span', '', 'Password strength');
        const strengthValue = node('span', 'strength-value', 'Not entered');
        strengthHeader.append(strengthTitle, strengthValue);
        const strengthMeter = node('progress', 'strength-meter');
        strengthMeter.max = 5;
        strengthMeter.value = 0;
        strengthMeter.setAttribute('aria-label', 'Password strength');
        strength.append(strengthHeader, strengthMeter);

        const requirements = node('ul', 'requirements');
        requirements.id = 'passwordRequirements';
        const requirementNodes = new Map();
        REQUIREMENTS.forEach((requirement) => {
            const item = node('li', 'requirement');
            const state = node('span', 'requirement-state', 'Required');
            const label = node('span', '', requirement.label);
            item.append(state, label);
            requirements.appendChild(item);
            requirementNodes.set(requirement.key, { item, state });
        });

        const match = node('p', 'match-message', 'Passwords must match.');
        match.id = 'passwordMatch';
        const feedback = node('div', 'form-feedback');
        feedback.setAttribute('role', 'status');
        feedback.setAttribute('aria-live', 'polite');

        const submit = node('button', 'btn recovery-submit', 'Update Password');
        submit.type = 'submit';
        submit.disabled = true;

        form.append(
            newPasswordGroup,
            confirmGroup,
            strength,
            requirements,
            match,
            feedback,
            submit
        );
        container.replaceChildren(form);

        function refresh() {
            const result = evaluate(newPassword.value);
            const passwordsMatch = !!confirmPassword.value && newPassword.value === confirmPassword.value;
            strengthMeter.value = result.score;
            strengthValue.textContent = result.score === 0
                ? 'Not entered'
                : result.score < 3
                    ? 'Weak'
                    : result.score < result.maximumScore
                        ? 'Moderate'
                        : 'Strong';
            requirementNodes.forEach((entry, key) => {
                const passed = !!result.checks[key];
                entry.item.classList.toggle('met', passed);
                entry.state.textContent = passed ? 'Met' : 'Required';
            });
            match.textContent = confirmPassword.value
                ? (passwordsMatch ? 'Passwords match.' : 'Passwords do not match.')
                : 'Passwords must match.';
            match.classList.toggle('met', passwordsMatch);
            submit.disabled = !(result.valid && passwordsMatch);
            return { result, passwordsMatch };
        }

        newPassword.addEventListener('input', refresh);
        confirmPassword.addEventListener('input', refresh);
        form.addEventListener('submit', async (event) => {
            event.preventDefault();
            const validation = refresh();
            if (!validation.result.valid || !validation.passwordsMatch || submit.disabled) return;
            submit.disabled = true;
            submit.textContent = 'Updating...';
            feedback.textContent = '';
            feedback.className = 'form-feedback';
            try {
                const result = await options.onSubmit(newPassword.value);
                if (!result?.ok) {
                    feedback.textContent = result?.error || 'Password could not be updated. Try again.';
                    feedback.className = 'form-feedback err';
                    submit.textContent = 'Update Password';
                    refresh();
                    options.onError?.(result);
                    return;
                }
                newPassword.value = '';
                confirmPassword.value = '';
                newPassword.disabled = true;
                confirmPassword.disabled = true;
                submit.disabled = true;
                submit.textContent = 'Password Updated';
                feedback.textContent = result.message || 'Password updated successfully.';
                feedback.className = 'form-feedback ok';
                options.onSuccess?.(result);
            } catch (_error) {
                feedback.textContent = 'We could not connect to the authentication service. Check your connection and try again.';
                feedback.className = 'form-feedback err';
                submit.textContent = 'Update Password';
                refresh();
                options.onError?.({ code: 'RECOVERY_NETWORK_ERROR' });
            }
        });

        return Object.freeze({
            form,
            newPassword,
            confirmPassword,
            submit,
            refresh
        });
    }

    global.PasswordRecoveryUI = Object.freeze({
        REQUIREMENTS,
        evaluate,
        mountRequest,
        mount
    });
})(typeof window !== 'undefined' ? window : globalThis);
