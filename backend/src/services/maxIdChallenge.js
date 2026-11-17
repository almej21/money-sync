const ID_SELECTOR = 'app-user-login-form #idInput input[formcontrolname="id"]';
const SUBMIT_SELECTOR = "app-user-login-form .general-button.send-me-code";

// MAX can add an ID field to its password form after unsuccessful logins.
export function configureMaxIdChallenge(scraper, nationalID) {
  const getLoginOptions = scraper.getLoginOptions.bind(scraper);
  scraper.getLoginOptions = (credentials) => {
    const options = getLoginOptions(credentials);
    const preAction = options.preAction;
    const postAction = options.postAction;
    let idSubmitted = false;

    async function fillId(page) {
      if (!nationalID) {
        throw new Error("MAX requires an ID number. Add it to the bank connection and retry.");
      }
      await page.$eval(ID_SELECTOR, (input) => { input.value = ""; });
      await page.type(ID_SELECTOR, nationalID);
      idSubmitted = true;
    }

    options.preAction = async () => {
      const result = await preAction();
      const page = result || scraper.page;
      const idInput = await page.$(ID_SELECTOR);
      if (idInput && await idInput.isVisible()) await fillId(page);
      return result;
    };
    options.postAction = async () => {
      const page = scraper.page;
      const loginResult = postAction();
      if (idSubmitted) return loginResult;
      const challenge = page.waitForSelector(ID_SELECTOR, { visible: true, timeout: 19000 })
        .then(() => true, () => false);
      if (await Promise.race([loginResult.then(() => false), challenge])) {
        await fillId(page);
        await page.$eval(SUBMIT_SELECTOR, (button) => button.click());
      }
      return loginResult;
    };
    return options;
  };
}
