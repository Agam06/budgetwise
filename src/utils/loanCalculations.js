export function calcEMI(principal, annualRate, months) {
    if (annualRate === 0) {
      return {
        emi: principal / months,
        totalPayable: principal,
        totalInterest: 0,
      };
    }
  
    const r = annualRate / 100 / 12;
  
    const emi =
      (principal * r * Math.pow(1 + r, months)) /
      (Math.pow(1 + r, months) - 1);
  
    const totalPayable = emi * months;
  
    return {
      emi: Math.round(emi),
      totalPayable: Math.round(totalPayable),
      totalInterest: Math.round(totalPayable - principal),
    };
  }
  
  export function daysElapsed(dateStr) {
    const then = new Date(dateStr.split("/").reverse().join("-"));
  
    return Math.floor(
      (new Date() - then) / (1000 * 60 * 60 * 24)
    );
  }
  
  export function getAccruedInterest(loan) {
    if (loan.annualRate === 0) return 0;
  
    return Math.round(
      loan.remainingPrincipal *
        (loan.annualRate / 100) *
        (daysElapsed(loan.takenOn) / 365)
    );
  }