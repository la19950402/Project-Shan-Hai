import { currentState } from '../state.js?v=step24-r28-card-batch-workflow-20260312h';
import { giftPhysicalRewardForCurrentStudent, redeemVoucherForCurrentStudent, grantShopCatalogItemToCurrentStudent } from '../services/shop-service.js?v=step24-r28-card-batch-workflow-20260312h';

export async function buyPhysicalRewardFromForm({ itemId, itemName, price }) {
  return giftPhysicalRewardForCurrentStudent(currentState.studentData, {
    itemId,
    itemName,
    price,
  }, {
    token: currentState.currentToken,
  });
}

export async function redeemVoucherFromForm(voucherId, teacherUid = null) {
  return redeemVoucherForCurrentStudent(currentState.studentData, voucherId, {
    token: currentState.currentToken,
    teacherUid,
  });
}


export async function buyTeacherCatalogItemFromForm(itemMeta) {
  return grantShopCatalogItemToCurrentStudent(currentState.studentData, itemMeta, {
    token: currentState.currentToken,
  });
}
