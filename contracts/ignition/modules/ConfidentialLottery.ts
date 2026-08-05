// This setup uses Hardhat Ignition to manage smart contract deployments.
// Learn more about it at https://hardhat.org/ignition

import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const ConfidentialLotteryModule = buildModule("ConfidentialLotteryModule", (m) => {
  const token = m.contract("ConfidentialERC20");
  const lottery = m.contract("ConfidentialLottery", [token]);
  return { token, lottery };
});

export default ConfidentialLotteryModule;
