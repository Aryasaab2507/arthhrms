# Import Blueprint

Purpose: prepare for employee, attendance, and payroll import work.

## Initial Import Targets
- Employees
- Attendance
- Payroll

## Supported Template Columns

Employee Master:
- `empId`, `fullName`, `department`, `designation`, `managerId`, `salary`, `joinDate`, `branch`, `shiftId`, `phone`, `email`, `employmentStatus`

Attendance:
- `empId`, `date`, `checkIn`, `checkOut`, `status`, `shiftId`

Payroll:
- `empId`, `month`, `basicSalary`, `allowances`, `deductions`, `bonus`, `finalSalary`

## Safety Requirements
- Validate `empId` against the official `ARTH-EMP-YYYY-0001` standard.
- Normalize legacy `EMP####` import IDs into official IDs while preserving the supplied value as company/legacy code.
- Track import logs.
- Report skipped rows and errors.
- Avoid overwriting unrelated live data.
- Reject broken manager references, duplicate emails, duplicate phone numbers, duplicate attendance dates, and duplicate payroll months.

## Current Status
`services/importService.js` owns parsing, validation, preview status, safe import execution, and log preparation while `db.js` remains the storage compatibility layer.
