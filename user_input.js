function collectUserInputs() {
    const inputs = {};

    // Audit file (only if uploaded)
    const auditFile = document.getElementById('auditInput').files[0];
    if (auditFile) {
        inputs.audit = auditFile; // File object — use FormData or FileReader to process it
    }

    // Degree (always present)
    inputs.major = document.getElementById('majorSelect').value;

    // Minor (only if not "None")
    const minorSelect = document.querySelectorAll('select')[1]; // second select on the page
    if (minorSelect.value !== 'None') {
        inputs.minor = minorSelect.value;
    }

    // Interest classes (only if any were added)
    if (userInterestTags.length > 0) {
        inputs.interestClasses = [...userInterestTags];
    }

    return inputs;
}